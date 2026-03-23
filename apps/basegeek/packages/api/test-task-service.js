import mongoose from 'mongoose';
import taskService from './src/graphql/bujogeek/services/taskService.js';
import { getAppConnection } from './src/graphql/shared/appConnections.js';

async function runTest() {
  try {
    const userId = "6818c2bddcf626909f6a93a1"; // From our previous test
    const dateStr = "2025-04-24"; // The date of the sample task found

    console.log(`Running getTasksForDateRange for user ${ userId } on date ${ dateStr }...`);

    // Explicitly wait for the connection to be ready before calling the service
    const bujoConn = getAppConnection('bujogeek');
    await new Promise(resolve => bujoConn.once('open', resolve));

    const tasks = await taskService.getTasksForDateRange({
      userId,
      startDate: new Date(dateStr),
      endDate: new Date(dateStr),
      viewType: 'daily'
    });

    console.log(`\nFound ${ tasks.length } tasks via taskService.getTasksForDateRange!`);
    if (tasks.length > 0) {
      console.log('Sample task returned:');
      console.log(tasks[0].content);
    }

    // Also test a raw Task.find query
    const { default: Task } = await import('./src/graphql/bujogeek/models/Task.js');
    const rawTasks = await Task.find({ createdBy: userId });
    console.log(`\nRaw Task.find({ createdBy: '${ userId }' }) returned ${ rawTasks.length } tasks.`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

runTest();
