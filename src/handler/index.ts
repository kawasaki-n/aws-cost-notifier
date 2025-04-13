import { AwsCostDataType } from '@/types';
import { Handler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import axios, { AxiosError } from 'axios';
import moment = require('moment');
import os = require('os');

const PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const dateFormat = 'YYYY-MM-DD';

export const handler: Handler = async () => {
  const awsCostDatas = await getAwsCost();
  const message = await convertMessage(awsCostDatas);
  console.log(message);
  await notify(message);

  return {
    status: 200,
    body: 'SUCCESS',
  };
};

const getAwsCost = async () => {
  const costExplorer = new AWS.CostExplorer({ region: 'us-east-1' });
  const constResult = await costExplorer
    .getCostAndUsage({
      TimePeriod: {
        Start: moment().add(-1, 'day').startOf('month').format(dateFormat),
        End: moment().format(dateFormat),
      },
      Metrics: ['NET_AMORTIZED_COST', 'UNBLENDED_COST'],
      Granularity: 'MONTHLY',
      GroupBy: [{ Key: 'SERVICE', Type: 'DIMENSION' }],
    })
    .promise();

  const ret = constResult.ResultsByTime?.map((r) => {
    let total = 0;
    return {
      period_start: r.TimePeriod?.Start,
      period_end: r.TimePeriod?.End,
      serviceCost: r.Groups?.map((g) => {
        const cost = Number.parseFloat(g.Metrics?.NetAmortizedCost?.Amount || 'NaN');
        total += cost;
        return {
          service: g.Keys?.join('') || '',
          cost: cost,
        };
      }).filter((r) => r.cost > 0),
      totalCost: total,
    };
  });

  return ret;
};

const convertMessage = async (awsCostDatas: AwsCostDataType[] | undefined) => {
  if (!awsCostDatas || awsCostDatas.length === 0)
    return `${os.EOL}AWSの利用料金が取得できませんでした。`;

  const rate = await getCurrentRate();

  // let ret = `${os.EOL}`;
  let ret = '';
  const data = awsCostDatas[0];
  ret += `${data.period_start} から ${data.period_end} までの利用料金は ${convertDollarToJpy(
    data.totalCost,
    rate
  )} です。${os.EOL}-----------------`;
  data.serviceCost?.forEach((r) => {
    ret += `${os.EOL}${r.service} / ${convertDollarToJpy(r.cost, rate)}`;
  });
  return ret;
};

const getCurrentRate = async (): Promise<number | null> => {
  return await axios
    .get(
      `https://openexchangerates.org/api/latest.json?app_id=${process.env.OPEN_EXCHANGE_RATES_APP_ID}`
    )
    .then((res) => {
      return res.data.rates.JPY as number;
    })
    .catch((err) => {
      console.error(err);
      return null;
    });
};

const convertDollarToJpy = (dollar: number, rate: number | null) => {
  if (rate === null) {
    return `${dollar} ドル`;
  }
  return `${Math.round(dollar * rate)} 円`;
};

const notify = async (msg: string) => {
  const config = {
    url: PUSH_ENDPOINT,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    data: {
      to: `${process.env.LINE_OWN_USER_ID}`,
      messages: [{ type: 'text', text: msg }],
    },
  };
  await axios
    // @ts-ignore
    .request(config)
    .then((res) => {
      console.log(res.data);
    })
    .catch((e: AxiosError) => {
      if (e !== undefined) {
        console.error(e);
      }
    });
};
