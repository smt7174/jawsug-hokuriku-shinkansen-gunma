import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { LoggingFormat } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays, LogGroup } from 'aws-cdk-lib/aws-logs';
import {
  RestApi,
  LambdaIntegration,
  LogGroupLogDestination,
  AccessLogFormat,
  MethodLoggingLevel,
  CfnAccount,
  AwsIntegration,
} from 'aws-cdk-lib/aws-apigateway';
import {
  PolicyDocument,
  PolicyStatement,
  Effect,
  Role,
  ServicePrincipal,
  StarPrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import {
  StateMachine,
  DefinitionBody,
  QueryLanguage,
  LogLevel,
  StateMachineType,
} from 'aws-cdk-lib/aws-stepfunctions';
import path from 'node:path';

const DURABLE_FUNCTION_ALIAS = 'latest';
export class AwsCdkToolkitLibraryDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const durableRole = new Role(this, 'DurableFunctionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicDurableExecutionRolePolicy'
        ),
      ],
    });

    // Durable Functionの定義
    const durableFunc = new NodejsFunction(this, 'DurableFunction', {
      entry: path.resolve(__dirname, '../lambda/durable.ts'),
      functionName: 'CdkToolkitDurableFunction',
      runtime: Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      handler: 'handler',
      loggingFormat: LoggingFormat.JSON,
      // logRetention: RetentionDays.ONE_WEEK,
      logGroup: new LogGroup(this, 'DurableFunctionLogGroup', {
        retention: RetentionDays.ONE_WEEK,
      }),
      durableConfig: {
        executionTimeout: cdk.Duration.minutes(15),
        retentionPeriod: cdk.Duration.days(1),
      },
      role: durableRole,
    });

    const durableFuncAlias = durableFunc.addAlias(DURABLE_FUNCTION_ALIAS);

    durableFunc.applyRemovalPolicy(
      cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE
    );

    const policy = new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['execute-api:Invoke'],
          principals: [new StarPrincipal()],
          resources: [`arn:aws:execute-api:${this.region}:${this.account}:*`],
        }),
      ],
    });

    const restApiLogGroup = new LogGroup(this, `RestApiLogGroup`, {
      removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      retention: RetentionDays.ONE_WEEK,
    });

    // API Gateway(RestAPI)
    const restApi = new RestApi(this, `RestApi`, {
      restApiName: `ToolkitDemoRestApi`,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(restApiLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.INFO,
        stageName: 'dev',
      },
      policy,
    });

    restApi.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    // API GatewayのAPI->設定にある「ログ記録」にあるCloudWatchロールARNの設定
    // FYI: https://kakakakakku.hatenablog.com/entry/2024/11/08/131847
    const cfnAccountRole = new Role(this, `ApiGatewayCloudWatchLogsRole`, {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    new CfnAccount(this, `ApiGatewayCfnAccount`, {
      cloudWatchRoleArn: cfnAccountRole.roleArn,
    });

    // API Gatewayにリクエスト先のリソースを追加
    const demoResource = restApi.root.addResource('demo');
    const durableResource = restApi.root.addResource('durable');
    const durableResource2 = restApi.root.addResource('durable2');
    // リソースにGETメソッド、Lambda統合プロキシを指定
    durableResource.addMethod('POST', new LambdaIntegration(durableFunc));

    const smLogGroup = new cdk.aws_logs.LogGroup(
      this,
      'DemoStateMachineLogGroup',
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      }
    );

    const stateMachine = new StateMachine(this, 'DemoStateMachine', {
      comment: '検証用のDemoステートマシン',
      definitionBody: DefinitionBody.fromFile(
        path.resolve(__dirname, './asl/demo-state-machine.asl.json')
      ),
      logs: {
        destination: smLogGroup,
        level: LogLevel.ALL,
      },
      stateMachineName: 'cdkToolkitDemoStateMachine',
      queryLanguage: QueryLanguage.JSONATA,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stateMachineType: StateMachineType.EXPRESS,
    });

    cdk.Tags.of(this).add(
      'GITHUB_REPO_URL',
      'https://github.com/smt7174/jaws-cdk-event-19'
    );
  }
}
