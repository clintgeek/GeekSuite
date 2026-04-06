import axios from 'axios';

async function run() {
  try {
    const loginRes = await axios.post('https://basegeek.clintgeek.com/api/auth/login', {
      identifier: 'clint@clintgeek.com',
      password: 'password123',
      app: 'notegeek'
    });

    let token = loginRes.data.token || loginRes.data.geek_token;
    if (!token && loginRes.headers['set-cookie']) {
      const cookie = loginRes.headers['set-cookie'].find(c => c.includes('geek_token='));
      if (cookie) token = cookie.split('geek_token=')[1].split(';')[0];
    }

    if (!token) {
      console.log("No token", loginRes.data);
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${ token }`
    };

    // 1. Check noteTags
    const tagsRes = await fetch('https://basegeek.clintgeek.com/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'query { noteTags }' })
    });
    const tagsData = await tagsRes.json();
    console.log("Tags:", JSON.stringify(tagsData, null, 2));

    // 2. Fetch all notes
    const notesRes = await fetch('https://basegeek.clintgeek.com/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: '{ notes { id title tags type content } }'
      })
    });
    const notesData = await notesRes.json();

    if (!notesData.data || !notesData.data.notes) {
      console.log("Failed to fetch notes:", notesData);
      return;
    }

    console.log(`Found ${ notesData.data.notes.length } notes`);

    if (notesData.data.notes.length > 0) {
      const noteToEdit = notesData.data.notes[0];
      console.log(`Editing note: ${ noteToEdit.id }`);

      const updateRes = await fetch('https://basegeek.clintgeek.com/graphql', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: `
           mutation UpdateNote($id: ID!, $title: String, $content: String, $type: String, $tags: [String!]) {
             updateNote(id: $id, title: $title, content: $content, type: $type, tags: $tags) {
               id title tags
             }
           }
         `,
          variables: {
            id: noteToEdit.id,
            title: noteToEdit.title + ' (edited)',
            content: noteToEdit.content,
            type: noteToEdit.type,
            tags: noteToEdit.tags || []
          }
        })
      });
      const updateData = await updateRes.json();
      console.log("Update result:", JSON.stringify(updateData, null, 2));
    }

  } catch (e) {
    console.error(e);
  }
}
run();
