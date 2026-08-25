export type MondayItem = {
  id: string;
  name: string;
  fields: Record<string, string>;
};

export type DashboardData = {
  generatedAt: string;
  deals: {
    sourceCount: number;
    validCount: number;
    openCount: number;
    wonCount: number;
    deadCount: number;
    onHoldCount: number;
    pipelineValue: number;
    wonValue: number;
    bySector: Array<{ name: string; value: number; count: number }>;
    byStage: Array<{ name: string; value: number; count: number }>;
  };
  workOrders: {
    count: number;
    completed: number;
    ongoing: number;
    notStarted: number;
    atRisk: number;
    receivable: number;
    billedValue: number;
    collectedValue: number;
    bySector: Array<{ name: string; count: number }>;
    byStatus: Array<{ name: string; count: number }>;
  };
  crossBoard: {
    matchedClients: number;
    totalWorkOrderClients: number;
    clientsWithOpenDealsAndActiveWork: number;
  };
  dataQuality: {
    score: number;
    dealFlagged: number;
    workOrderFlagged: number;
    totalRows: number;
  };
};
