import { matchCandles } from './matcher.js';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,match:matchCandles(data.candles,data.query)}); }
  catch(error) { self.postMessage({id:data.id,error:error.message}); }
};
