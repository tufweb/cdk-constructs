import { MethodOptions } from 'aws-cdk-lib/aws-apigateway';
import { Function } from 'aws-cdk-lib/aws-lambda';

export interface ApiIntegration {
  /**
   * resource and method that this integration is registering. This should correlate to a resouce and associated method within the provided OpenAPI spec document.
   *
   * Note that unlike other mechanisms, no identifiers need to be added to the OpenAPI spec document. This only requires a valid document and the AWS API Gateway extensions do not need to be present in advance.
   */
  resourcePath: string; // e.g., "/environments/{env-id}"
  method: HttpMethod; // e.g., "GET", "POST"
  methodOptions: MethodOptions;

  /**
   * The Lambda function ARN that will be used by this integration.
   */
  readonly integrationType: ApiIntegrationType;
  readonly integrationProps: LambdaIntegrationProps;

  useDefaultAuthorizer?: boolean; // Optional: Use default Cognito authorizer
  cognitoUserPool?: string; // Optional: Specific Cognito user pool name
  cognitoUserPoolArn?: string; // Optional: Specific Cognito user pool ARN
}

export type ApiIntegrationType = 'lambda'; // Expand as more integrations are added

interface LambdaIntegrationProps {
  readonly lambdaArn?: string;
  readonly lambdaFunction?: Function;
}

export enum HttpMethod {
  ANY = 'ANY',
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE'
}
