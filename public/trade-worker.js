import {discoverTrades} from '/src/trade-engine.js';
self.onmessage=({data})=>{
  try {const iterator=discoverTrades(data.context,data.brief);let result;
    do{result=iterator.next();if(!result.done)self.postMessage({progress:result.value});}while(!result.done);
    self.postMessage({result:result.value});
  }catch(error){self.postMessage({error:error.message});}
};
