import { Names, RemovalPolicy } from 'aws-cdk-lib';
import { OAuthScope, UserPool } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface ICognitoAuth {
  readonly userPool: UserPool;
}

export interface CognitoAuthProps {
  /**
   * The allowed origins for the Cognito client
   */
  readonly allowedOrigins: string[];

  /**
   * The allowed callback paths for the Cognito client
   */
  readonly allowedCallbackPaths: string[];

  /**
   * The allowed logout paths for the Cognito client
   */
  readonly allowedLogoutPaths: string[];
}

/**
 * A Cognito User Pool with a client and domain
 */
export class CognitoAuth extends Construct implements ICognitoAuth {

  private _userPool: UserPool;
  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

    this._userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });

    this._userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: Names.uniqueId(this).toLowerCase().replace('/', '-'),
      },
    });

    const { allowedOrigins, allowedCallbackPaths, allowedLogoutPaths } = props;

    this._userPool.addClient('CognitoClient', {
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: allowedOrigins.flatMap(origin => allowedCallbackPaths.map(path => `${origin}${path}`)),
        logoutUrls: allowedOrigins.flatMap(origin => allowedLogoutPaths.map(path => `${origin}${path}`)),
      },
    });

    this._userPool.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
  get userPool(): UserPool {
    return this._userPool;
  }
}