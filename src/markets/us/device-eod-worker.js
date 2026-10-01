import { buildDeviceDataset } from './device-eod-core.js?v=20261001-us-device1';
self.onmessage = async ({ data }) => {
  try {
    const dataset = await buildDeviceDataset(data, { progress:percent => self.postMessage({ percent }) });
    self.postMessage({ dataset });
  } catch (error) { self.postMessage({ error:error.message }); }
};
