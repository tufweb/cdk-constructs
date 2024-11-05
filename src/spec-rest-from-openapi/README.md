# APIFromSpec

## Purpose
In order to follow an 'api-first' approach, it would be ideal to create the API Gateway resource from an OpenAPI 3.0 spec.

## Problems
There are issues with this, as any routes need to be defined with an appropriate integration (i.e. Lambda).

In order to achieve this, at least with Lambda, the Function names need to be known in advance when designing the spec.

The same goes for configuring any Authorizers on the API. (e.g. The Cognito User Pool needs to be known in advance)

Naturally, this is challenging in a scenario where these resource names are not known in advance, as is typically the case when using CDK.

Although you can force the function names, it's not good practice for a few reasons:

* Limits ability to create multiple stacks in the same account, as Lambda function names are not namespaced
* Still relies on tight coupling between the API spec and the backend implementation, which is not ideal.

## Potential Solutions

### Solution 1 - Fn::Sub and Fn.transform

The first solution I found was to use the Fn::Sub CloudFormation intrinsic function as follows:

**Template creation**

1. Original template file will have the `uri` segments updated as follows.
```
paths:
  /environments:
    get:
      x-amazon-apigateway-integration:
        uri:
          Fn::Sub: "arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${GetEnvironments.Arn}/invocations"
```

By using a placeholder that matches the method (GET) and resource name (/Environments),
it's possible to auto-generate resource names that can be referenced (i.e. `GetEnvironments` above).

2. Template is uploaded to the CDK bucket as an Asset
3. A Cloudformation Transform expression is created that will include that asset and perform any required transformations (i.e. perform the Fn::Sub substitutions.)

   At this point, the Open API 3.0 spec is available with the correct integration URIs.
4. A new `SpecRestApi` construct is created using this spec.

**Individual integrations are created as follows**

To add an integration, the Lambda function needs its resource ID in CloudFormation to be updated so that the `Fn::Sub` intrinsic function is able to look it up.

**Limitations**

This is somewhat hacky, and also has a severe limitation that a single Lambda function can only register for a single integration
(Renaming the function multiple times would result in only the final rename taking effect.). In order for this to work, the individual functions would still need to be identified in the original spec.

An alternative would be to create Cfn Parameters, but they need to be defined as strings and cannot be used to lookup function ARNs at deploy time so this does not work.

The same mechanism can, however, be used to update the authorizers, which is a good thing as we will see below.

### Solution 2 - AWS Solutions Constructs, aws-openapigateway-lambda

This solution, provided by AWS Solutions Constructs can be used to tokenize Open API 3.0 spec documents in a similar, but different fashion.

[AWS OpenApiGateway Lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-openapigateway-lambda.html)

**How it works**

Instead of using `Fn::Sub`, this solution uses a Cloudformation Custom Resource to transform the template.
This custom resource replaces any tokenized parts of the original Open API spec with an integration that is provided to the construct.

**Problems**

This works well, except for a few critical flaws:

* It can only update the integration URLs, it cannot update the authorizer configuration.
  This means we have the same issue as before, but now with the Cognito User pool rather than the integration details.
* Although this will work just fine, it still requires that the original Open API spec has these placeholders under the `x-amazon-apigateway-integration` Open Api spec extension.
  It would be ideal if such a custom resource could correctly and automatically inject any extra extensions required by API Gateway.

If it was just the authorizer issue, this solution would suffice. Alas, it does not.

### Proposed Solution 1 - Hybrid AWS Solutions Constructs + Fn::Sub for Authorizers

Investigate if it's possible to 'pre-process' the Open API spec template using the `Fn::Sub` method before providing it to the `aws-openapigateway-lambda` construct.
I feel like this may not be possible as `aws-openapigateway-lambda` requires the Asset to be in S3. I am not sure that I can daisy-chain the assets like this.

If possible, this could be a 'quick-fix' to get this working.

### Proposed Solution 1 - Custom implementation of the TemplateWriter Custom resource

If we are going to do this properly, it would make sense to re-implement the AWS Solutions Constructs solution and make it more flexible.

I would expect it to do the following:

* Allow providing of a 'default' integration that will be used for any resource methods that do not have an integration explicitly defined. This could even be an auto-generated 'stub' function.
* Allow providing a default authorizer that will be used on all resources generated from the OpenApi Spec
* Require A list of integrations to be provided. Each integration should provide a list of API resources/methods that it should handle.
  (Or maybe a single resource method can be registered multiple times with the same Lambda function and it will add it to the list)
* Each provided integration could also provide an overridden authorizer.

With the above, I would expect it to do the following:

* ***NOT*** require the `x-amazon-apigateway-integration` api extension to be present
* Parse the unaltered Open API spec to find each resource method.
* Inject the appropriate `x-amazon-apigateway-integration` section into each resourece method. This integration should be derived from the integrations provided to the constuct.
* Inject any required authorizers, both into  `components.securitySchemes` as well as into the `security` section for each resource method. Again, based on the provided integrations.

As this functionality is more advanced than the AWS Solutions Constructs method (which uses a simple template writer custom resource),
it would need to be implemented as a net-new custom resource and not be based on the AWS Solutions Constructs mechanism.

A simple template writer will not suffice, as we would need to parse and update the json document.

## References

Some light reading on this subject....

* [aws-openapigateway-lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-openapigateway-lambda.html)
* [AWS Blog - Build APIs using OpenAPI, the AWS CDK and AWS Solutions Constructs](https://aws.amazon.com/blogs/devops/build-apis-using-openapi-the-aws-cdk-and-aws-solutions-constructs/)
* [Serverless OpenAPI & Amazon API Gateway with the AWS CDK — Part 1](https://blog.serverlessadvocate.com/serverless-openapi-amazon-api-gateway-with-the-aws-cdk-part-1-8a90477ebc24)
* [Github - Parameterized swagger support for API gateway](https://github.com/aws/aws-cdk/issues/1461)
* [SO - AWS CDK how to create an API Gateway backed by Lambda from OpenApi spec?](https://stackoverflow.com/questions/62179893/aws-cdk-how-to-create-an-api-gateway-backed-by-lambda-from-openapi-spec)
* [Reddit: Best way to keep API specs from diverging?](https://www.reddit.com/r/aws/comments/1607mgw/best_way_to_keep_api_specs_from_diverging/)
* [Swagger Editor](https://editor.swagger.io/)
* [openapi-generator](https://openapi-generator.tech/) [Github](https://github.com/OpenAPITools/openapi-generator)
* [OpenApi Typescript](https://openapi-ts.dev/) [Github](https://github.com/openapi-ts/openapi-typescript)
* [Argo+Helm+openapi](https://github.com/argoproj/argo-helm/issues/2157)
* [OpenAPI + JSON Schema](https://blog.stoplight.io/openapi-json-schema)