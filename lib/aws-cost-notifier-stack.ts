import * as cdk from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class AwsCostNotifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const role = new Role(this, 'CostNotifierIamRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ['*'],
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'ce:GetCostAndUsage',
      ],
    });
    role.addToPolicy(policy);

    const lambda = new NodejsFunction(this, 'CostNotifierFunction', {
      entry: 'src/handler/index.ts',
      runtime: Runtime.NODEJS_14_X,
      handler: 'handler',
      functionName: 'cost-notifier-function',
      environment: {
        LINE_NOTIFY_ACCESS_TOKEN: process.env.LINE_NOTIFY_ACCESS_TOKEN || '',
        OPEN_EXCHANGE_RATES_APP_ID: process.env.OPEN_EXCHANGE_RATES_APP_ID || '',
      },
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      role: role,
      logRetention: RetentionDays.ONE_WEEK,
    });

    new Rule(this, 'cron-cost-notifier-function', {
      // JSTで毎日18時に実行
      schedule: Schedule.cron({ minute: '0', hour: '9', day: '*' }),
      targets: [new LambdaFunction(lambda, { retryAttempts: 3 })],
    });
  }
}
