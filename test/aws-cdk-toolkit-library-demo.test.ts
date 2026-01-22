import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as AwsCdkToolkitLibraryDemo from '../lib/aws-cdk-toolkit-library-demo-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/aws-cdk-toolkit-library-demo-stack.ts
test('Lambda Function Created', () => {
  const app = new cdk.App();
    // WHEN
  const stack = new AwsCdkToolkitLibraryDemo.AwsCdkToolkitLibraryDemoStack(app, 'MyTestStack');
    // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'CdkToolkitDemoFunction'
  });
});
