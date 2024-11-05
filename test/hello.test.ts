import { Stack } from 'aws-cdk-lib';
import { SwaggerUi } from '../src';


test('SwaggerUI', () => {
  const app = new Stack();
  const stack = new SwaggerUi(app, 'Test', {});
  expect(stack).toBeDefined();
});