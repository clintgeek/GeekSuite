import axios from 'axios';

const API_URL = 'https://basegeek.clintgeek.com/graphql';

async function main() {
  const loginRes = await axios.post('https://basegeek.clintgeek.com/api/auth/login', {
    identifier: 'clint@clintgeek.com', password: 'password123', app: 'notegeek'
  });

  let token = loginRes.data.token || loginRes.data.geek_token;
  if (!token && loginRes.headers['set-cookie']) {
    const cookie = loginRes.headers['set-cookie'].find(c => c.includes('geek_token='));
    if (cookie) token = cookie.split('geek_token=')[1].split(';')[0];
  }
  if (!token) throw new Error('Failed to login');

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ token }` };

  const getRes = await axios.post(API_URL, {
    query: `query { dailyTasks(date: "2026-03-08") { id content status } }`
  }, { headers });

  const tasks = getRes.data.data?.dailyTasks || [];
  if (tasks.length === 0) {
    console.log('No tasks found to update. Fetching weekly tasks to find a backup task...');
    const weekRes = await axios.post(API_URL, {
      query: `query { weeklyTasks(date: "2026-03-08") { id content status } }`
    }, { headers });
    const weekTasks = weekRes.data.data?.weeklyTasks || [];
    if (weekTasks.length === 0) return console.log('No weekly tasks either.');
    tasks.push(...weekTasks);
  }
  const task = tasks[0];
  console.log('Updating task:', task.id, task.content, task.status);

  const mutRes = await axios.post(API_URL, {
    query: `
      mutation UpdateTaskStatus($id: ID!, $status: String!) {
        updateTaskStatus(id: $id, status: $status) {
          id
          content
          status
        }
      }
    `,
    variables: { id: task.id, status: task.status === 'completed' ? 'pending' : 'completed' }
  }, { headers });

  console.log('Update result:', JSON.stringify(mutRes.data, null, 2));
}
main().catch(console.error);
