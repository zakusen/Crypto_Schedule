export const TRANSFORM_KEY='teamdev-v02-pdca-crystal-transform-v11';
export const TRANSFORM_DEFAULTS=Object.freeze({angles:Object.freeze({x:180,y:0,z:0}),enabled:Object.freeze({x:false,y:true,z:false})});
export const copyTransform=value=>({angles:{...value.angles},enabled:{...value.enabled}});
export function validTransform(value){return !!value&&Object.keys(value).sort().join(',')==='angles,enabled'&&['angles','enabled'].every(key=>Object.keys(value[key]||{}).sort().join(',')==='x,y,z')&&['x','y','z'].every(axis=>Number.isFinite(value.angles[axis])&&value.angles[axis]>=-180&&value.angles[axis]<=180&&typeof value.enabled[axis]==='boolean');}
export function normalizeTransform(value){return copyTransform(validTransform(value)?value:TRANSFORM_DEFAULTS);}
export function parseTransform(raw){if(raw===null||raw===undefined)return {revision:0,values:copyTransform(TRANSFORM_DEFAULTS)};const saved=JSON.parse(raw);if(saved.version!==1||!Number.isSafeInteger(saved.revision)||saved.revision<1||!validTransform(saved.values))throw Error('invalid_transform');return {revision:saved.revision,values:copyTransform(saved.values)};}
export function readTransformStorage(storage){try{return parseTransform(storage?.getItem(TRANSFORM_KEY)).values}catch{return copyTransform(TRANSFORM_DEFAULTS)}}
