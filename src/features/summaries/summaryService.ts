import { movementService, type Movement } from '../movements/movementService';
import { refundService, type Refund } from '../movements/refundService';

export type PeriodRecords = {
  movements: Movement[];
  refunds: Refund[];
};

export function createSummaryService(
  movementReader = movementService,
  refundReader = refundService,
) {
  return {
    async listPeriodRecords(): Promise<PeriodRecords> {
      const [movements, refunds] = await Promise.all([
        movementReader.listMovements(),
        refundReader.listRefunds(),
      ]);

      return { movements, refunds };
    },
  };
}

export const summaryService = createSummaryService();
