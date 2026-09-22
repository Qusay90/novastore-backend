'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');

test('owned acceptance shutdown releases the actual revocation LISTEN client before pool cleanup, once',async()=>{
    const events=[];
    let leased=false;
    class Listener extends EventEmitter{
        async query(sql){events.push(sql.split(' ')[0]);}
        release(){assert.equal(leased,true);leased=false;events.push('release');}
    }
    const client=new Listener();
    const pool={async connect(){leased=true;return client;},end(){events.push('pool.end');return leased?new Promise(()=>{}):Promise.resolve();}};
    // Execute the real revocation implementation against a checked-out fake
    // PostgreSQL connection; no configured database or HTTP server is opened.
    const revocationModule={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/socketRevocationService.js'),'utf8'),{
        module:revocationModule,require(name){assert.equal(name,'../config/db');return pool;}
    });
    const service=revocationModule.exports.socketRevocationService;
    await service.start();assert.equal(service.isReady(),true);assert.equal(leased,true);

    const launcher=fs.readFileSync(path.join(__dirname,'../scripts/themePlatformWave2LocalAcceptance.js'),'utf8');
    const boundary=launcher.indexOf('async function main(){');assert.ok(boundary>0);
    const entryModule={exports:{}};
    // Load the actual launcher declarations, excluding only its side-effectful
    // main entry. This exercises stopAcceptance itself, not a duplicate helper.
    vm.runInNewContext(launcher.slice(0,boundary)+'\nmodule.exports={stopAcceptance,setState(value){db=value.db;runtime=value.runtime;}};',{
        module:entryModule,setTimeout,clearTimeout,clearInterval,
        require(name){
            if(name.startsWith('node:'))return require(name);
            if(name==='../tests/helpers/themePlatformDisposableDb')return ()=>{throw Error('Unexpected database start');};
            if(name==='../services/socketRevocationService')return revocationModule.exports;
            if(name==='../services/stockyOrderDeliveryWorkerService')return {stopStockyOrderDeliveryWorker(){events.push('stopStocky');}};
            if(name==='../services/notificationWorkerService')return {stopNotificationWorker(){events.push('stopNotifications');}};
            throw Error('Unexpected dependency: '+name);
        }
    });
    const api=entryModule.exports;
    api.setState({runtime:{io:{disconnectSockets(){events.push('disconnect');},close(callback){events.push('close');callback();},httpServer:{closeAllConnections(){events.push('closeConnections');}}}},db:{async cleanup(){await pool.end();events.push('removeOwnedContainer');return {ownedContainerRemoved:true};},originalConsole:{log(){events.push('report');}}}});
    let timeout;
    try{await Promise.race([Promise.all([api.stopAcceptance(),api.stopAcceptance()]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Cleanup stayed blocked by the leased LISTEN client')),250);})]);}
    finally{clearTimeout(timeout);}
    assert.deepEqual(events,['LISTEN','stopStocky','stopNotifications','UNLISTEN','release','disconnect','close','closeConnections','pool.end','removeOwnedContainer','report']);
    assert.equal(service.isReady(),false);assert.equal(leased,false);assert.equal(client.listenerCount('notification'),0);
});
