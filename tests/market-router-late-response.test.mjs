import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketRouter} from '../src/app/marketRouter.js';

test('late Taiwan activation cannot clean up the currently visible US information page', async () => {
  const router = createMarketRouter();
  let finishTaiwan, host = '', cleanups = 0;
  router.register({id:'tw', activate(){host='tw radar';return new Promise(resolve=>{finishTaiwan=resolve;});}, deactivate(){cleanups++;host='';}});
  router.register({id:'crypto', activate(){host='crypto radar';}, deactivate(){host='';}});
  router.register({id:'us', activate(){host='us data';}, deactivate(){host='';}});
  const pending = router.activate('tw');
  await router.activate('crypto');
  await router.activate('us', {view:'data'});
  assert.equal(host,'us data');
  finishTaiwan();
  assert.equal(await pending,false,'superseded activation must not claim to be current');
  assert.equal(cleanups,1,'leaving a market cleans its shared host exactly once');
  assert.equal(router.current(),'us');
  assert.equal(host,'us data','late completion leaves the new market visible');
});
