import { AwsCostDataType } from '@/types';
import { Handler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import axios, { Axios, AxiosError } from 'axios';
import moment = require('moment');
import * as qs from 'querystring';
import os = require('os');

const dateFormat = 'YYYY-MM-DD';
export const handler: Handler = async () => {
  console.log('start handler');

  const awsCostDatas = await getAwsCost();
  const message = convertMessage(awsCostDatas);
  await notify(message);
};

const getAwsCost = async () => {
  const costExplorer = new AWS.CostExplorer({ region: 'us-east-1' });
  const constResult = await costExplorer
    .getCostAndUsage({
      TimePeriod: {
        Start: moment().startOf('month').format(dateFormat),
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

const convertMessage = (awsCostDatas: AwsCostDataType[] | undefined) => {
  if (!awsCostDatas || awsCostDatas.length === 0)
    return `${os.EOL}AWSの利用料金が取得できませんでした。`;

  let ret = `${os.EOL}`;
  const data = awsCostDatas[0];
  ret += `${data.period_end} までの利用料金は $ ${data.totalCost} です。${os.EOL}-----------------`;
  data.serviceCost?.forEach((r) => {
    ret += `${os.EOL}${r.service} / $ ${r.cost}`;
  });
  return ret;
};

const notify = async (msg: string) => {
  const config = {
    url: 'https://notify-api.line.me/api/notify',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_NOTIFY_ACCESS_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: qs.stringify({
      message: msg,
    }),
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
