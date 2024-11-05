import { randomBytes } from 'crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CorsOptions } from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { load, dump } from 'js-yaml';
import { ApiIntegration } from '../api-integration';

const s3Client = new S3Client({
  region: process.env.REGION,
});

// interface ApiIntegration {

// }

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Event: ${JSON.stringify(event)}`);
  let status = 'SUCCESS';
  let response = {};
  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    try {
      const defaultApiIntegration = JSON.parse(event.ResourceProperties.DefaultApiIntegration);
      const apiIntegrations = JSON.parse(event.ResourceProperties.ApiIntegrations);
      const defaultCorsPreflightOptions: CorsOptions = JSON.parse(event.ResourceProperties.DefaultCorsPreflightOptions);
      const defaultCognitoUserPool = event.ResourceProperties.DefaultCognitoUserPool;
      const defaultCognitoUserPoolArn = event.ResourceProperties.DefaultCognitoUserPoolArn;
      const sourceBucket = event.ResourceProperties.SourceBucket;
      const sourceSpecKey = event.ResourceProperties.SourceSpecKey;
      const outputBucket = event.ResourceProperties.OutputBucket;
      const outputKey = randomBytes(32).toString('hex');
      // const newSpec = {};

      const s3ClientResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: sourceBucket,
          Key: sourceSpecKey,
        }),
      );

      if (s3ClientResponse.Body) {
        const sourceBody = await s3ClientResponse.Body.transformToString();
        /**
         * Attempt to load JSON or Yaml
         *
         */
        let sourceType: 'json' | 'yaml' | undefined;
        let sourceSpec: any;

        try {
          sourceSpec = JSON.parse(sourceBody);
          sourceType = 'json';
        } catch {
          null;
        }

        try {
          sourceSpec = load(sourceBody);
          sourceType = 'yaml';
        } catch {
          null;
        }

        if (!sourceSpec) {
          status = 'FAILED';
          response = {
            Error: 'Error: Source OpenAPI Spec is not a valid JSON or Yaml document.',
          };
        }

        /**
         * Update the Open API Spec document
         */
        const newSpec = updateSpec(sourceSpec, {
          apiIntegrations,
          defaultCorsPreflightOptions,
          defaultCognitoUserPool,
          defaultCognitoUserPoolArn,
          defaultApiIntegration,
        });

        /**
         * Write the updated template back to S3
         */
        let newSpecBody: string | undefined;
        try {
          newSpecBody = sourceType === 'json' ? JSON.stringify(newSpec) : sourceType === 'yaml' ? dump(newSpec, { indent: 2 }) : undefined;
        } catch {
          status = 'FAILED';
          response = {
            Error: `Error: Could not convert back to ${sourceType}`,
          };
        }

        await s3Client.send(
          new PutObjectCommand({
            Bucket: outputBucket,
            Key: outputKey,
            Body: newSpecBody,
          }),
        );

        response = {
          OpenAPISpecOutputKey: outputKey,
        };

      } else {
        status = 'FAILED';
        response = {
          Error: 'Error: Source OpenAPI Spec is empty',
        };
      }


    } catch (error) {
      status = 'FAILED';
      response = {
        Error: `Error is: ${error}`,
      };
    } finally {
      // it happened
    }
  }
  const fullResponse = {
    Status: status,
    Reason: JSON.stringify(response),
    PhysicalResourceId: event.LogicalResourceId ?? context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: response,
  };

  console.log(`Event: ${JSON.stringify(fullResponse)}`);
  return fullResponse;
};

interface UpdateSpecOptions {
  apiIntegrations: ApiIntegration[];
  defaultApiIntegration?: ApiIntegration; // Optional: default integration
  defaultCorsPreflightOptions?: CorsOptions;
  defaultCognitoUserPool?: string; // Optional: default Cognito user pool name
  defaultCognitoUserPoolArn?: string; // Optional: default Cognito user pool ARN
}

function updateSpec(spec: any, options: UpdateSpecOptions): any {
  const {
    apiIntegrations,
    defaultCorsPreflightOptions,
    defaultApiIntegration,
    defaultCognitoUserPool,
    defaultCognitoUserPoolArn,
  } = options;

  console.log(`Input Spec: ${JSON.stringify(spec)}`);
  console.log(`Update Options: ${JSON.stringify(options)}`);

  // Helper function to find the Lambda integration for a given resource and method
  const findLambdaIntegration = (
    resourcePath: string,
    method: HttpMethod,
  ): ApiIntegration | undefined => {
    return apiIntegrations.find(
      (apiIntegration) =>
        /**
         * Perform the resource path match in normalized case and without leading or trailing slashes
         */
        apiIntegration.resourcePath.toLowerCase().replace(/^\/|\/$/g, '') === resourcePath.toLowerCase().replace(/^\/|\/$/g, '') &&
        apiIntegration.method.toUpperCase() === method.toUpperCase() &&
        apiIntegration.integrationType === 'lambda',
    );
  };

  // Helper function to add Cognito security scheme to components if necessary
  const ensureCognitoSecurityScheme = (poolArn: string, poolName: string) => {
    spec.components = spec.components || {};
    spec.components.securitySchemes = spec.components.securitySchemes || {};

    const authorizerName = `cognitoAuthorizer_${poolName}`;

    if (!spec.components.securitySchemes[authorizerName]) {
      spec.components.securitySchemes[authorizerName] = {
        'type': 'apiKey',
        'name': 'Authorization',
        'in': 'header',
        'x-amazon-apigateway-authtype': 'cognito_user_pools',
        'x-amazon-apigateway-authorizer': {
          type: 'cognito_user_pools',
          providerARNs: [poolArn],
        },
      };
    }
    return authorizerName;
  };

  const defaultLambdaArn =
    defaultApiIntegration?.integrationType === 'lambda'
      ? defaultApiIntegration.integrationProps.lambdaArn
      : undefined;

  // Iterate through all paths and methods in the spec
  for (const resourcePath in spec.paths) {
    if (spec.paths.hasOwnProperty(resourcePath)) {
      const methods = spec.paths[resourcePath];

      for (const method in methods) {
        if (methods.hasOwnProperty(method)) {
          // Find corresponding lambda integration
          //   const integration = findLambdaIntegration(resourcePath, method.toUpperCase() as HttpMethod);
          const apiIntegration = findLambdaIntegration(resourcePath, method as HttpMethod);

          // If integration found, use it; otherwise, check for default Lambda
          const lambdaArn = apiIntegration?.integrationProps.lambdaArn || defaultLambdaArn;
          if (!lambdaArn) {
            throw new Error(
              `No Lambda integration found for ${resourcePath} ${method}, and no default provided.`,
            );
          }

          // Add or update the API Gateway x-amazon-apigateway-integration extension for Lambda
          methods[method]['x-amazon-apigateway-integration'] = {
            type: 'aws_proxy',
            httpMethod: 'POST',
            uri: `arn:aws:apigateway:${process.env.AWS_REGION}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`,
            passthroughBehavior: 'when_no_match',
            // credentials: '${roleArn}',  // Replace with the appropriate role ARN
          };

          // Handle Cognito authorization logic
          let cognitoUserPoolArn: string | undefined = undefined;
          let cognitoAuthorizerName: string | undefined = undefined;

          /**
           * We will only configure an authorizer in the following scenarios:
           * 1. cognitoUserPool is set
           * or
           * 2. useDefaultAuthorizer and defaultCognitoUserPool is set
           */

          if (
            apiIntegration?.useDefaultAuthorizer &&
            (apiIntegration?.cognitoUserPoolArn || apiIntegration?.cognitoUserPool)
          ) {
            throw new Error(
              'Error: You cannot use the default authorizer AND specify a custom cognito user pool.',
            );
          }
          if (apiIntegration?.useDefaultAuthorizer) {
            console.debug('Attempting to use default authorizer for this API integration');
            // Attempt to use default authorizer if specified
            if (defaultCognitoUserPoolArn && defaultCognitoUserPool) {
              throw new Error(
                'Error: You must only provide defaultCognitoUserPoolArn or defaultCognitoUserPool, not both',
              );
            } else if (defaultCognitoUserPoolArn || defaultCognitoUserPool) {
              // Only use authorizer if configured
              cognitoUserPoolArn =
                defaultCognitoUserPoolArn ||
                (defaultCognitoUserPool
                  ? `arn:aws:cognito-idp:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:userpool/${defaultCognitoUserPool}`
                  : undefined);
              console.debug(`defaultCognitoUserPoolArn or defaultCognitoUserPool was provided. Setting cognitoUsterPoolArn to: ${cognitoUserPoolArn}`);
              if (cognitoUserPoolArn) {
                cognitoAuthorizerName = ensureCognitoSecurityScheme(
                  cognitoUserPoolArn,
                  defaultCognitoUserPool || 'default',
                );
              } else {
                console.error('This should not happen. Why did this happen?');
              }
            } else {
              console.debug('No default Cognito Userpool was provided');
            }
          } else {
            // Attempt to use integration authorizer if specified
            if (apiIntegration?.cognitoUserPoolArn && apiIntegration?.cognitoUserPool) {
              throw new Error(
                'Error: The integration should only provide cognitoUserPoolArn or cognitoUserPool, not both',
              );
            } else {
              // Only use authorizer if configured
              cognitoUserPoolArn =
                apiIntegration?.cognitoUserPoolArn ||
                (apiIntegration?.cognitoUserPool
                  ? `arn:aws:cognito-idp:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:userpool/${apiIntegration.cognitoUserPool}`
                  : undefined);
              if (cognitoUserPoolArn) {
                const userPoolName =
                  apiIntegration?.cognitoUserPool || cognitoUserPoolArn.split('/').slice(-1)[0];
                cognitoAuthorizerName = ensureCognitoSecurityScheme(
                  cognitoUserPoolArn,
                  userPoolName,
                );
              }
            }
          }

          if (cognitoAuthorizerName) {
            // Add security requirement for this method
            methods[method].security = [
              {
                [cognitoAuthorizerName]: apiIntegration?.methodOptions.authorizationScopes ?? [],
              },
            ];
          }
        }
      }
      /**
       * Add OPTIONS method if CORS is enabled.
       * Currently only supports default cors preflight options.
       * Currently only adds cors preflight options if OPTIONS method was not already defined in the Spec for this resource.
       */

      if ((!methods.hasOwnProperty(HttpMethod.OPTIONS)) && (defaultCorsPreflightOptions)) {
        // console.log(`Generating OPTIONS method for ${resourcePath} resource`)
        methods.options = {
          'responses': {
            204: {
              description: '204 response',
              headers: {
                'Access-Control-Allow-Origin': {
                  schema: {
                    type: 'string',
                  },
                },
                'Access-Control-Allow-Methods': {
                  schema: {
                    type: 'string',
                  },
                },
                'Access-Control-Allow-Credentials': {
                  schema: {
                    type: 'string',
                  },
                },
                'Vary': {
                  schema: {
                    type: 'string',
                  },
                },
                'Access-Control-Allow-Headers': {
                  schema: {
                    type: 'string',
                  },
                },
              },
            },
          },
          'x-amazon-apigateway-integration': {
            responses: {
              default: {
                statusCode: '204',
                responseParameters: {
                  'method.response.header.Access-Control-Allow-Credentials': `'${defaultCorsPreflightOptions.allowCredentials}'`,
                  // "method.response.header.Access-Control-Allow-Methods": "'GET,POST,OPTIONS,DELETE'",
                  'method.response.header.Access-Control-Allow-Methods': `'${defaultCorsPreflightOptions.allowMethods?.join(',')}'`,
                  'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
                  // "method.response.header.Access-Control-Allow-Headers": `'${defaultCorsPreflightOptions.allowHeaders?.join(',')}'`,
                  // "method.response.header.Access-Control-Allow-Origin": "'http://localhost:4200'",
                  'method.response.header.Access-Control-Allow-Origin': `'${defaultCorsPreflightOptions.allowOrigins?.join(',')}'`,
                  'method.response.header.Vary': "'Origin'",
                },
              },
            },
            requestTemplates: {
              'application/json': '{ statusCode: 200 }',
            },
            passthroughBehavior: 'when_no_match',
            type: 'mock',
          },
        };
      }
    }
  }
  console.log(`Generated Spec: ${JSON.stringify(spec)}`);
  return spec; // Return the updated spec
}
