import mongoose from 'mongoose';
import taskService from './src/graphql/bujogeek/services/taskService.js';
import { getAppConnection } from './src/graphql/shared/appConnections.js';

async function runTest() {
  const userId = '6818c2bddcf626909f6a93a1';
  const startOfDayDate = taskService.toUtcMidnight('2025-04-24');
  const endOfDayDate = new Date(startOfDayDate);
  endOfDayDate.setUTCHours(23, 59, 59, 999);

  const query = { createdBy: userId, isBacklog: { $ne: true } };
  query.$or = [
    { dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } },
    { status: 'completed', updatedAt: { $gte: startOfDayDate, $lte: endOfDayDate } },
    { dueDate: null, status: 'pending', createdAt: { $lte: endOfDayDate } },
    { dueDate: { $lt: startOfDayDate }, status: { $in: ['pending', 'migrated_future'] } },
  ];

  console.log('Constructed query:', JSON.stringify(query, null, 2));

  const bujoConn = getAppConnection('bujogeek');
  await new Promise(resolve => bujoConn.once('open', resolve));
  const { default: Task } = await import('./src/graphql/bujogeek/models/Task.js');

  const results = await Task.find(query);
  console.log('Query using all filters returned', results.length, 'results');

  const justCreatedBy = await Task.find({ createdBy: userId });
  console.log('Query with just createdBy returned', justCreatedBy.length, 'results');

  const createdByBacklog = await Task.find({ createdBy: userId, isBacklog: { $ne: true } });
  console.log('Query with createdBy + isBacklog returned', createdByBacklog.length, 'results');

  const dueDateNull = await Task.find({ createdBy: userId, dueDate: null });
  console.log('Query with createdBy + dueDate: null returned', dueDateNull.length, 'results');

  const statusPending = await Task.find({ createdBy: userId, status: 'pending' });
  console.log('Query with createdBy + status: pending returned', statusPending.length, 'results');

  const condition3 = await Task.find({ createdBy: userId, dueDate: null, status: 'pending', createdAt: { $lte: endOfDayDate } });
  console.log('Query with condition 3: dueDate null + pending + createdAt <= endOfDay returned:', condition3.length);

  // Take the first pending task with dueDate: null and check it out
  console.log('Sample task status/dueDate/createdAt:', JSON.stringify({
    status: statusPending[0]?.status,
    dueDate: statusPending[0]?.dueDate,
    createdAt: statusPending[0]?.createdAt,
  }, null, 2));

  process.exit(0);
}

runTest();
