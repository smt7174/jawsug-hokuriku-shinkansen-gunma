import { Toolkit, StackSelectionStrategy, CdkAppMultiContext, ToolkitError, AssemblyError, BaseCredentials, NonInteractiveIoHost } from '@aws-cdk/toolkit-lib';
import { App } from 'aws-cdk-lib';
import { AwsCdkToolkitLibraryDemoStack } from './lib/aws-cdk-toolkit-library-demo-stack';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { green, red, bold } from 'colors/safe';
import { execSync } from 'node:child_process';
import path from 'node:path';

type mode = {
  isTestOnly?: boolean;
  isInvokeLambda?: boolean;
  isCleanup?: boolean
};

const NO_ERROR = 0;
const WITH_ERROR = 1;

async function test() {
  successLog(`${bold('Executing Unit Test...')}`);
  // const app = new App();
  // const stack = new AwsCdkToolkitLibraryDemoStack(app, 'AwsCdkToolkitLibraryDemoStack');
  // const template = Template.fromStack(stack);
  
  // template.hasResourceProperties('AWS::Lambda::Queue', {
  //   FunctionName: "CdkToolkitDemoFunction",
  // });

  try {
    execSync('npm run test');
    return NO_ERROR;
  } catch (error) {
    errorLog('Error during unit test');
    return WITH_ERROR;
  }
}

// Step One: Create the cloud assembly
// Define the steps to build the cloud assembly for the cdk application
async function createCloudAssembly(toolkit: Toolkit) {
  successLog(`${bold('Creating CloudAssebmly...')}`);
    // コンテクスト上書き
    const context = new CdkAppMultiContext(path.resolve(__dirname));
    await context.update({
      env: 'test', 
    });
  const assembly = await toolkit.fromAssemblyBuilder(async () => {
    const app = new App();
    new AwsCdkToolkitLibraryDemoStack(app, 'AwsCdkToolkitLibraryDemoStack');
    const cloudAssembly = app.synth();
    return cloudAssembly;
  }, {
      outdir: path.resolve(__dirname, 'cdk.out'),
      contextStore: context,
  });
  successLog(`${bold('Creating Successful')}`);
  return assembly;
}

// Step Two: Deploy the stack from the previously created cloud assembly
async function deployStack(toolkit: Toolkit, cloudAssembly: any, stackName: string) {
  successLog(`${bold('Deploying stack:')} ${stackName}...`);
  const result = await toolkit.deploy(cloudAssembly, {
    stacks: {
      strategy: StackSelectionStrategy.PATTERN_MUST_MATCH,
      patterns: [stackName],
    },
  });
  successLog('Deployment successful.');
  
  const stack = result.stacks.find((s) => s.stackName === stackName);
  if (!stack) {
    throw new Error(`Stack ${stackName} not found after deployment`);
  }
  
  return stack;
}

// Step Three: Invoke the Lambda function that was deployed from the cdk application
// This is how we will test if our cdk deployment and lambda code are working as expected
async function invokeLambda(functionArn: string, payload: any): Promise<void> {
  successLog('Invoking Lambda with payload...');
  const lambdaClient = new LambdaClient({});
  const invokeCommand = new InvokeCommand({
    FunctionName: functionArn,
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const response = await lambdaClient.send(invokeCommand);
  const responseData = JSON.parse(Buffer.from(response.Payload ?? []).toString());

  // console.log(responseData.statusCode);
  
  if (responseData.statusCode && responseData.statusCode === 200) {
    successLog('Invoke Lambda passed');
    successLog(responseData);
  } else {
    errorLog('Invoke Lambda failed');
    errorLog(responseData);
  }
  
  return;
}

// Step Four: Destroy the stack
// This is how we will clean up the stack after we are done testing
async function destroyStack(toolkit: Toolkit, cloudAssembly: any, stackName: string) {
  successLog(`${bold('Destroying stack:')} ${stackName}...`);
  try {
    await toolkit.destroy(cloudAssembly, {
      stacks: {
        strategy: StackSelectionStrategy.PATTERN_MUST_MATCH,
        patterns: [stackName],
      },
    });
    successLog('Stack destroyed successfully.');
  } catch (error) {
    errorLog('Error during stack destruction:');
    throw error;
  }
}

const errorLog = (message: any) => {
  console.error(bold(red(message)));
}

const successLog = (message: any) => {
  console.log(bold(green(message)));
}

async function main(mode?: mode) {
  const toolkit = new Toolkit();
  // const toolkit = new Toolkit({
  //   sdkConfig: { 
  //     baseCredentials: BaseCredentials.awsCliCompatible({ profile: 'default' }),
  //   },
  // })
  
  const stackName = 'AwsCdkToolkitLibraryDemoStack';
  let cloudAssembly;
    
  const isTestOnly = mode?.isTestOnly ?? false;
  const isInvokeLambda = mode?.isInvokeLambda ?? false;
  const isCleanup = mode?.isCleanup ?? false;
  // let isDeployed = false;
  
  try {
    // Step 1: Create cloud assembly
    cloudAssembly = await createCloudAssembly(toolkit);
    // const x = toolkit.synth(cloudAssembly);
    
    const testResult = await test();
    if (isTestOnly || testResult === WITH_ERROR) return;

    // Step 2: Deploy stack
    const stack = await deployStack(toolkit, cloudAssembly, stackName);
    // isDeployed = true;
    
    // Step 3: Get Lambda ARN and invoke it
    if (isInvokeLambda) {
      const functionArn = stack.outputs['functionArn'];
      // successLog(`Lambda Function ARN: ${functionArn}`);
    
      // Uncomment to test a successful payload
      // await invokeLambda(functionArn, { payload: 'test-successful' });
      // Uncomment to test a failed payload
      await invokeLambda(functionArn, { payload: 'test-failed' });
    }
    
    // Step 4: Destroy stack
    // await destroyStack(toolkit, cloudAssembly, stackName);
    process.exit(NO_ERROR);

  } catch (error) {
    errorLog('Error during this harness:');
    errorLog(error);
    
    // Try to clean up if we have a cloud assembly
    if (cloudAssembly) {
      try {
        if (isCleanup) {
          await destroyStack(toolkit, cloudAssembly, stackName);
        } else {
          console.log('isDestroyOnFailure value is false. Cleaning up stack is skipped.');
        }
      } catch (cleanupError) {
        errorLog('Failed to clean up stack after error:');
        errorLog(cleanupError);
      }
    }
    
    process.exit(WITH_ERROR);
  }
}

main();
