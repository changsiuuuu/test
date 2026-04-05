import { MANUAL_SCHEDULE, validateManualSchedule } from './scheduleData.js';

const result = validateManualSchedule(MANUAL_SCHEDULE);

if (result.isValid) {
  console.log(`OK: 총 ${result.totalMatches}경기, 모든 검증 통과`);
} else {
  console.error(`FAIL: ${result.issues.length}개 이슈`);
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
}
