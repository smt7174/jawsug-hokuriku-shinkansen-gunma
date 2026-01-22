import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';
import { StepFunctionsStartExecution } from 'aws-cdk-lib/aws-scheduler-targets';

type TTreasure = {
  condition: string;
  necessary: boolean;
  memo: string;
  name: string;
  effect: string;
  floor: number;
};

export const handler = withDurableExecution(
  async (event: any, context: DurableContext) => {
    // const orderId = '123ABC';
    //
    // Step 1: Validate order
    // const validationResult = await context.step(async (stepContext) => {
    //   stepContext.logger.info(`Validating order ${orderId}`);
    //   return { orderId, status: "validated" };
    // });

    // Step 2: Process payment
    // const paymentResult = await context.step(async (stepContext) => {
    //   stepContext.logger.info(`Processing payment for order ${orderId}`);
    //   return { orderId, status: "paid", amount: 99.99 };
    // });

    // Wait for 10 seconds to simulate external confirmation
    // await context.wait({ seconds: 10 });

    // Step 3: Confirm order
    // const confirmationResult = await context.step(async (stepContext) => {
    //   stepContext.logger.info(`Confirming order ${orderId}`);
    //   return { orderId, status: "confirmed" };
    // });

    // return {
    //   orderId: orderId,
    //   status: "completed",
    //   steps: [validationResult, paymentResult, confirmationResult]
    // };

    // const x = (context: DurableContext) => {
    //   return await context.step(async stepContext => {
    //     stepContext.logger.info('treasuresステップが開始');
    //     const myTreasures = getTreasures();
    //     stepContext.logger.info('treasuresステップが終了');
    //     return { myTreasures };
    //   });
    // };

    let retryCount = 0;
    const treasures = await context.step('treasure', async stepContext => {
      stepContext.logger.info('treasuresステップが開始');
      const myTreasures = getTreasures();
      stepContext.logger.info('treasuresステップが終了');
      return { myTreasures };
    });

    await context.wait({ seconds: 10 });

    const parallelResult = await context.parallel('parallel1', [
      async childContext => {
        await childContext.step('parallel1-step1', async stepContext => {
          stepContext.logger.info('parallel1-step1が開始');
        });
        const mapResult = await childContext.map(
          'treasure-map',
          treasures.myTreasures,
          async (ctx: DurableContext, treasure: TTreasure, index: number) => {
            ctx.logger.info(`treasure-mapの${index}番目の処理を開始`);
            return await ctx.step(async () => {
              return `${treasure.floor}階の宝物は${treasure.name}で、効果は${treasure.effect}です。`;
            });
          }
        );
        return {
          step1: mapResult.getResults(),
        };
      },
      async childContext => {
        await childContext.step('parallel1-step2', async stepContext => {
          stepContext.logger.info('parallel1-step2が開始');
        });
        const treasureResult = await childContext.map(
          'treasure-needed-or-not',
          treasures.myTreasures,
          async (ctx: DurableContext, treasure: TTreasure, index: number) => {
            ctx.logger.info(`treasure-needed-or-notの${index}番目の処理を開始`);
            return await ctx.step(async () => {
              const needOrNotString = treasure.necessary
                ? '必須です。'
                : '必須ではありません。';
              return `${treasure.floor}階の宝物はクリアに${needOrNotString}`;
            });
          }
        );
        return {
          step2: treasureResult.getResults(),
        };
      },
      async childContext => {
        return await childContext.step('parallel1-step3', async () => {
          return {
            step3: 'step3 completed.',
          };
        });
      },
    ]);

    const retryStep = await context.step(
      'retry',
      async stepContext => {
        stepContext.logger.info('retryステップが開始');
        if (retryCount <= 3) {
          stepContext.logger.error('retryステップでエラー発生');
          retryCount++;
          throw new Error('retry step Error');
        }

        stepContext.logger.info('retryステップが終了');
        return {
          retry: 'retry-step completed.',
        };
      },
      {
        retryStrategy: (_, attemptsMade: number) => {
          const shouldRetry = attemptsMade <= 3;
          return {
            shouldRetry,
            delay: {
              seconds: 1 + attemptsMade,
            },
          };
        },
      }
    );

    return {
      status: 'completed',
      steps: {
        treasures: treasures,
        parallel: parallelResult.getResults(),
        retry: retryStep,
      },
    };
  }
);

const getTreasures = () => {
  const treasures = [
    {
      condition: 'グリーンスライムを3匹倒す',
      necessary: false,
      memo: 'シルバーマトックを取る前に壊さないこと',
      name: 'カッパーマトック',
      effect: '壁を壊せる（宝を取る前後1回）',
      floor: 1,
    },
    {
      condition: 'ブラックスライムを2匹倒す',
      necessary: false,
      memo: 'なくてもクリア自体は可能',
      name: 'ジェットブーツ',
      effect: '足が速くなる',
      floor: 2,
    },
    {
      condition: 'ブルーナイトのどちらかを倒す',
      necessary: false,
      memo: 'ポーション系は上書きなので、ほかのポーションを取ったらなくなる',
      name: 'ポーションオブヒーリング',
      effect: 'やられても1度だけギルが減らない。効果は1回だけ',
      floor: 3,
    },
    {
      condition: 'カギを取る前に扉に触れる',
      necessary: false,
      memo: '',
      name: 'チャイム',
      effect: 'フロア開始から少しの間、カギがある方向を向くと音が鳴る',
      floor: 4,
    },
    {
      condition: 'メイジの呪文を歩きながら3回受ける',
      necessary: true,
      memo: 'これを取らないと、最終的にエクスカリバーまで取れず、ドルアーガを倒せない',
      name: 'ホワイトスウォード',
      effect: '特になし。ただしクリアに必須',
      floor: 5,
    },
  ];

  return treasures.sort((a, b) => Number(a.floor) - Number(b.floor));
};
