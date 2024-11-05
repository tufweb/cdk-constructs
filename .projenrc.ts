import { awscdk, javascript } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Tom Francis',
  authorAddress: 'tom@tufweb.ca',
  cdkVersion: '2.155.0',
  defaultReleaseBranch: 'main',
  jsiiVersion: '~5.5.0',
  name: '@tufweb-dev/cdk-constructs',
  projenrcTs: true,
  repositoryUrl: 'https://github.com/tufweb/cdk-constructs.git',
  packageManager: NodePackageManager.NPM,

  description: 'A CDK construct library by TufWeb',
  // deps: [],                /* Runtime dependencies of this module. */
  deps: [
    '@aws-sdk/client-api-gateway',
    '@aws-sdk/client-s3',
    '@types/aws-lambda',
    '@types/js-yaml',
    'js-yaml',
  ],
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  devDeps: [
    'aws-cdk-lib',
    // '@types/aws-lambda',
    // '@aws-sdk/client-api-gateway',
  ],
  bundledDeps: [
    '@aws-sdk/client-api-gateway',
    '@aws-sdk/client-s3',
    '@types/aws-lambda',
    '@types/js-yaml',
    'js-yaml',
  ],
  // packageName: undefined,  /* The "name" in package.json. */

  releaseToNpm: true,
  npmAccess: javascript.NpmAccess.PUBLIC,

});
project.synth();