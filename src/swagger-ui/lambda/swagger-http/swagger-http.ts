import { APIGatewayClient, GetExportCommand } from '@aws-sdk/client-api-gateway';
import { APIGatewayProxyEvent } from 'aws-lambda';

export async function handler(request: APIGatewayProxyEvent) {
  const apiGatewayClient = new APIGatewayClient();
  const openApi3Spec = await apiGatewayClient.send(new GetExportCommand({
    // GetExportRequest
    restApiId: request.requestContext.apiId,
    stageName: request.requestContext.stage,
    exportType: 'oas30',
    parameters: {},
    accepts: 'application/json',
  }));

  if (!openApi3Spec.body) {
    throw new Error('No body found in API Gateway Export');
  }

  // Convert the body to a string
  const bodyString = Buffer.from(openApi3Spec.body).toString('utf-8');

  // Parse the string as JSON
  const openApi3SpecJson = JSON.parse(bodyString);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: generateSwaggerPageBody(JSON.stringify(openApi3SpecJson)),
  };
};

const generateSwaggerPageBody = (swaggerSpec: string) => `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Swagger</title>
            <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
        </head>
        <body>
            <div id="swagger"></div>
            <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
            <script>
              SwaggerUIBundle({
                dom_id: '#swagger',
                operationsSorter: 'alpha',
                spec: ${swaggerSpec}
            });
            </script>
        </body>
        </html>`;
