export type AwsCostDataType = {
  period_start: string | undefined;
  period_end: string | undefined;
  serviceCost: AwsServiceCostDataType[] | undefined;
  totalCost: number;
};

type AwsServiceCostDataType = {
  service: string;
  cost: number;
};
