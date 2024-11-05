import * as path from 'path';
import { ArnFormat, Stack } from 'aws-cdk-lib';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';

import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';


export interface SwaggerUiProps {
  readonly logGroup?: LogGroup;
  // apiGateway: IRestApi

}

export class SwaggerUi extends Construct {

  private _swaggerUiFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: SwaggerUiProps) {
    super(scope, id);

    console.info(`Using 'plain-http' SwaggerUI implementation for Construct: ${scope.toString()}`);

    const { logGroup } = props;

    this._swaggerUiFunction = new NodejsFunction(this, 'SwaggerUi', {
      runtime: new Runtime('nodejs20.x', RuntimeFamily.NODEJS),
      entry: path.join(__dirname, './lambda/swagger-http/swagger-http.ts'),
      handler: 'handler',
      logGroup,
    });


    this._swaggerUiFunction.role?.attachInlinePolicy(
      new Policy(this, 'SwaggerUIPolicy', {
        statements: [
          new PolicyStatement({
            actions: ['apigateway:GET'],
            resources: [
              Stack.of(this).formatArn({
                // https://docs.aws.amazon.com/apigateway/latest/developerguide/arn-format-reference.html
                service: 'apigateway',
                account: '',
                resource: '/restapis/*',
                arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              }),
            ],
          }),
        ],
      }),
    );
  }

  // public registerWithAPI(registerIntegrationFunction: (path: string, method: HttpMethod, lambdaFunction: NodejsFunction) => void) {
  //   registerIntegrationFunction('/docs', HttpMethod.GET, this._swaggerUiFunction)
  // }

}