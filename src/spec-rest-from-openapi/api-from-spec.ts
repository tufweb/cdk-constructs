import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Aws, CfnOutput, CfnResource, CustomResource } from 'aws-cdk-lib';
import {
  ApiDefinition,
  AuthorizationType,
  CfnDocumentationVersion,
  CorsOptions,
  Deployment,
  MethodOptions,
  SpecRestApi,
  Stage,
} from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ApiIntegration, HttpMethod } from './api-integration';
import { CognitoAuth } from './cognito-auth';


export interface SpecRestFromOpenApiProps {
  enableAuth?: boolean;
  cognitoUserPool?: UserPool;
  allowedOrigins?: string[];
  allowedCallbackPaths?: string[];
  allowedLogoutPaths?: string[];
  logGroup?: LogGroup;
  readonly defaultCognitoUserPool?: string;
  readonly defaultCognitoUserPoolArn?: string;
}

export interface ISpecRestFromOpenApi {
  api: SpecRestApi;
  registerAPILambdaFunction(
    resourcePath: string,
    method: HttpMethod,
    lambdaFunction: Function,
    // lambdaIntegrationOptions?: LambdaIntegrationOptions,
    // resourceOptions?: ResourceOptions,
    methodOptions?: MethodOptions
  ): void;
}

export class SpecRestFromOpenApi extends Construct implements ISpecRestFromOpenApi {
  private static _instance: SpecRestFromOpenApi | undefined;
  private _userPool?: UserPool;
  // private _authorizer: CognitoUserPoolsAuthorizer;

  private readonly _restApi: SpecRestApi;
  private readonly _cfnResource: CfnResource;
  private _prodDeployment: Deployment;

  private _defaultApiIntegrationJSON: string;
  private _defaultCorsPreflightOptions: CorsOptions;
  private _apiIntegrations: ApiIntegration[];

  private _outputSpecAsset: Asset;
  private _specUpdaterLambda: NodejsFunction;
  private _specUpdaterProvider: Provider;
  private _specUpdaterCustomResource: CustomResource;

  constructor(scope: Construct, id: string, props: SpecRestFromOpenApiProps) {
    super(scope, id);

    const { enableAuth, allowedOrigins, allowedCallbackPaths, allowedLogoutPaths, cognitoUserPool, logGroup } = props;

    if (SpecRestFromOpenApi._instance) {
      throw new Error('Error - use ApiFromSpec.instance to register Api integrations');
    } else {
      SpecRestFromOpenApi._instance = this;
    }

    /**
     * If auth is enabled and Cognito user pool is provided, use it
     */
    if (enableAuth && cognitoUserPool) {
      this._userPool = cognitoUserPool;
      console.info(
        `API: ${this.toString()} will use provided Cognito User Pool: ${this._userPool.toString()}`,
      );
    } else if (enableAuth) {
      /**
       * Otherwise if auth is enabled create a new one.
       */
      this._userPool = new CognitoAuth(
        this,
        'CognitoAuth',
        {
          allowedOrigins: allowedOrigins?? ['*'],
          allowedCallbackPaths: allowedCallbackPaths?? ['/'],
          allowedLogoutPaths: allowedLogoutPaths?? ['/'],
        },
      ).userPool;

      console.info(
        `API: ${this.toString()} will get a dedicated Cognito User Pool: ${this._userPool.toString()}`,
      );
      console.warn(
        `Cognito User Pool ${this._userPool.toString()}, for API: ${this.toString()} will get destroyed if this ApiFromSpec construct is destroyed!`,
      );
    } else {
      console.info(`Creating API: ${this.toString()} without authorization enabled!`);
    }

    const mockFunction = new NodejsFunction(this, 'MockFunction', {
      runtime: new Runtime('nodejs20.x', RuntimeFamily.NODEJS),
      entry: path.join(__dirname, '../mock-integration/lambda/mock.ts'),
      handler: 'handler',
      logGroup,
    });

    this._defaultApiIntegrationJSON = JSON.stringify({
      integrationType: 'lambda',
      integrationProps: {
        lambdaArn: mockFunction.functionArn,
      },
      useDefaultAuthorizer: true,
      // These do not apply for the default integration as it will be used for all resource paths/methods
      method: HttpMethod.ANY,
      resourcePath: '*',
    });

    this._defaultCorsPreflightOptions = {
      allowOrigins: allowedOrigins?? ['*'],
      allowHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
      ],
      allowMethods: ['GET', 'POST', 'OPTIONS', 'DELETE'], // Allowed methods
      allowCredentials: true,
    };

    this._apiIntegrations = [];

    const openApiSourceSpecFile = path.join(__dirname, '../openapi.yaml');
    const sourceSpecAsset = new Asset(this, 'Original SpecAsset', {
      path: openApiSourceSpecFile,
    });

    this._outputSpecAsset = new Asset(this, 'OutputSpec', {
      path: path.join(__dirname, ''),
    });

    this._specUpdaterLambda = new NodejsFunction(this, 'SpecUpdaterFunction', {
      /**
       * Check this...
       */
      runtime: Runtime.NODEJS_20_X,
      /**
       * vs this...
       */
      // runtime: new Runtime('nodejs20.x', RuntimeFamily.NODEJS),

      initialPolicy: [
        new PolicyStatement({
          actions: ['s3:GetObject'],
          effect: Effect.ALLOW,
          resources: [
            `arn:${Aws.PARTITION}:s3:::${sourceSpecAsset.s3BucketName}/${sourceSpecAsset.s3ObjectKey}`,
          ],
        }),
        new PolicyStatement({
          actions: ['s3:PutObject'],
          effect: Effect.ALLOW,
          resources: [`arn:${Aws.PARTITION}:s3:::${this._outputSpecAsset.s3BucketName}/*`],
        }),
      ],
      entry: path.join(__dirname, './lambda/openapi3-spec-rewriter.ts'),
      handler: 'handler',
      logGroup,
    });

    this._specUpdaterProvider = new Provider(this, 'SpecUpdaterProvider', {
      onEventHandler: this._specUpdaterLambda,
      logGroup,
    });

    /**
     * Creates a new CloudFormation Custom Resource that will be responsible for modifying the provided OpenAPI3.0 spec
     * so that it can be used to create/update the API Gateway, including any required integrations and authentication.
     *
     * By default, any routes defined in the spec will be created and set to use a 'default' integration if provided.
     * Then extra integrations can be added by using the register functions of this class.
     *
     * Currently only supports Lambda integrations.
     */
    this._specUpdaterCustomResource = new CustomResource(
      this,
      'OpenApiSpecUpdaterCustomResource',
      {
        resourceType: 'Custom::OpenAPISpecUpdater',
        serviceToken: this._specUpdaterProvider.serviceToken,
        properties: {
          DefaultApiIntegration: this._defaultApiIntegrationJSON,
          ApiIntegrations: JSON.stringify(this._apiIntegrations),
          DefaultCorsPreflightOptions: JSON.stringify(this._defaultCorsPreflightOptions),
          DefaultCognitoUserPoolArn: this._userPool?.userPoolArn,
          SourceBucket: sourceSpecAsset.s3BucketName,
          SourceSpecKey: sourceSpecAsset.s3ObjectKey,
          OutputBucket: this._outputSpecAsset.s3BucketName,
        },
      },
    );

    /**
     * We need to store reference to the underlying CfnResource for modification later on as we add integrations.
     */
    this._cfnResource = this._specUpdaterCustomResource.node.defaultChild as CfnResource;

    /**
     * This is the construct that actually creates the API Gateway based on the modified OpenAPI 3.0 spec
     */
    this._restApi = new SpecRestApi(this, 'SpecRestAPI', {
      apiDefinition: ApiDefinition.fromBucket(
        this._outputSpecAsset.bucket,
        this._specUpdaterCustomResource.getAttString('OpenAPISpecOutputKey'),
      ),
      deploy: false,
      restApiName: 'CloudFactory',
    });

    const openApiSpec = fs.readFileSync(openApiSourceSpecFile, 'utf-8');

    const oasSpecHash = crypto.createHash('sha256').update(openApiSpec).digest('hex').substring(0, 8);

    console.log('Documentation Version: ' + oasSpecHash);

    const documentationVersion = new CfnDocumentationVersion(this, `docVersion-${oasSpecHash}`, {
      documentationVersion: oasSpecHash,
      restApiId: this._restApi.restApiId,
      description: 'This is a test of documentation',
    });

    this._prodDeployment = new Deployment(this, 'prodDeployment', {
      api: this._restApi,
    });

    this._prodDeployment.addToLogicalId(oasSpecHash);

    const stage = new Stage(this, 'prodStage', {
      deployment: this._prodDeployment,
      documentationVersion: documentationVersion.documentationVersion,
      stageName: 'prod',
    });

    /** Required for accessing URLs in Cfn Output */
    this._restApi.deploymentStage = stage;

    mockFunction.addPermission('ApiGWMockGet', {
      principal: new ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: this._restApi.arnForExecuteApi('GET', '/*', stage.stageName),
    });
    mockFunction.addPermission('ApiGWMockPost', {
      principal: new ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: this._restApi.arnForExecuteApi('POST', '/*', stage.stageName),
    });

    new CfnOutput(this, 'ApiEndpoint', {
      value: this._restApi.deploymentStage.urlForPath('/'),
    });

    this._prodDeployment.addToLogicalId(this._apiIntegrations);

  }

  /**
   * Register a Lambda function integration
   */
  public registerAPILambdaFunction(
    resourcePath: string,
    method: HttpMethod,
    lambdaFunction: Function,
    // lambdaIntegrationOptions?: LambdaIntegrationOptions,
    // resourceOptions?: ResourceOptions,
    methodOptions?: MethodOptions,
  ): void {

    const defaultMethodOptions: MethodOptions = {
      authorizationType: AuthorizationType.COGNITO,
      authorizationScopes: [
        'openid',
      ],

    };
    /**
     * Call down to generic integration function
     */
    this._registerAPIIntegration({
      integrationType: 'lambda',
      resourcePath,
      method,
      integrationProps: {
        lambdaFunction,
      },
      methodOptions: methodOptions?? defaultMethodOptions,
      useDefaultAuthorizer: true,
    });

  }

  public registerAnonymousAPILambdaFunction(
    resourcePath: string,
    method: HttpMethod,
    lambdaFunction: Function,
    methodOptions?: MethodOptions,
  ): void {

    const defaultMethodOptions: MethodOptions = {
      authorizationType: AuthorizationType.NONE,
    };
    /**
     * Call down to generic integration function
     */
    this._registerAPIIntegration({
      integrationType: 'lambda',
      resourcePath,
      method,
      integrationProps: {
        lambdaFunction,
      },
      methodOptions: methodOptions?? defaultMethodOptions,
      useDefaultAuthorizer: false,
    });

  }

  private _registerAPIIntegration(apiIntegration: ApiIntegration): void {

    /**
     * Create JSON serializable version of the ApiIntegration
     * This is a temp workaround as we cannot use JSON.stringify on a Function object
     * We need the Function object to register permissions on the funtion
     * Need to find a more elegant way to do this.
     */

    const { integrationType, resourcePath, method, methodOptions, integrationProps, useDefaultAuthorizer } = apiIntegration;

    /**
     * TODO: FAIL if integrationProps.lambdaArn or integrationProps.lambdaFunction is not set
     */

    const lambdaIntegrationArn = integrationProps.lambdaArn?? integrationProps.lambdaFunction?.functionArn ?? null;

    if (!lambdaIntegrationArn) {
      throw new Error('You must provide a Lambda Arn or a Lambda Function when registering an API integration');
    }

    const serializableApiIntegration = {
      integrationType,
      resourcePath,
      method,
      integrationProps: {
        lambdaArn: lambdaIntegrationArn,
      },
      methodOptions,
      useDefaultAuthorizer,
    };

    /** Add this integration to the list of integrations */
    this._apiIntegrations.push(serializableApiIntegration);

    /**
     * Create JSON serializable version of the ApiIntegration
     * This is a temp workaround as we cannot use JSON.stringify on a Function object
     * We need the Function object to register permissions on the funtion
     * Need to find a more elegant way to do this.
     */


    // /**
    //  * Update the CloudFormation custom resource property that defines the integrations.
    //  * This property is used by the Custom Resource when updating the OpenAPI 3.0 spec.
    //  */
    this._cfnResource.addPropertyOverride('ApiIntegrations', JSON.stringify(this._apiIntegrations));

    /**
     * Grant execution rights to this function
     * TODO: Move this to a less 'generic' function, or put it in an if statement depending on
     * integration type. For now it just supports Lambda, and my head hurts too much to change
     * it right now.
     */

    if (integrationProps.lambdaFunction) {
      integrationProps.lambdaFunction.addPermission('ApiGW-' + method + '-' + resourcePath, {
        principal: new ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: this._restApi.arnForExecuteApi(method, '/' + resourcePath.replace(/^\//, ''), this._restApi.deploymentStage.stageName),
      });
    }

    /**
     * Force the API Gateway deployment to update when the api integrations change.
     */
    this._prodDeployment.addToLogicalId(this._apiIntegrations);
  }

  public get api(): SpecRestApi {
    return this._restApi;
  }

  static get instance(): SpecRestFromOpenApi {
    if (!SpecRestFromOpenApi._instance) {
      throw new Error(
        'Error - New ApiFromSpec instance must be created in root context before you can use it to register Api integrations from other constructs!',
      );
    }
    return SpecRestFromOpenApi._instance;
  }
}
