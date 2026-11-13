import { readTeams, validateRecord, winnerFirst } from './recordData';
import type { RecordSchema } from './recordSchema';
import type { SessionRecord } from './resultTypes';

/**
 * The records this client can show: those that satisfy the sport's schema (a stored record that fails it is skipped),
 * each with its winner first (`winnerFirst`): a record saved with the higher score on the second team (by an older
 * client, or typed that way) still reads winner first, in the list and in the dialog.
 */
export function showableRecords(schema: RecordSchema, records: SessionRecord[]): SessionRecord[] {
  return records
    .filter(
      (record) =>
        readTeams(record.data, schema) !== null && validateRecord(schema, record.data).length === 0,
    )
    .map((record) => {
      const data = winnerFirst(schema, record.data);
      return data === record.data ? record : { ...record, data };
    });
}
