/**
 * Sends the planned creates and updates, one at a time. The client waits
 * and retries when the API says to slow down (120 requests a minute).
 */
export async function runImport(client, actions, { onProgress = () => {} } = {}) {
  const work = actions.filter((a) => a.type === 'create' || a.type === 'update');
  let done = 0;
  for (const action of work) {
    try {
      const res =
        action.type === 'create'
          ? await client.post('/products', action.body)
          : await client.put(`/products/${action.existing.id}`, action.body);
      action.result = action.type === 'create' ? 'created' : 'updated';
      action.productId = res?.data?.id ?? action.existing?.id;
    } catch (e) {
      action.result = 'failed';
      action.error = e.status ? `Joomni said ${e.status}: ${e.message}` : e.message;
    }
    onProgress(++done, work.length, action);
  }
  return actions;
}
