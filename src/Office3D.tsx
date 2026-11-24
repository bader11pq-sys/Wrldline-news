import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Html,OrbitControls} from '@react-three/drei';
import {useEffect,useRef} from 'react';
import type {Group,OrthographicCamera} from 'three';
import {agents} from '../shared/agents';
import type {AgentId} from '../shared/schema';
import {desks,type TeamStatus} from './Floor';

type V=[number,number,number];
function Box({p,s,c,onClick}:{p:V;s:V;c:string;onClick?:()=>void}){return <mesh position={p} onClick={onClick?e=>{e.stopPropagation();onClick();}:undefined}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={.9}/></mesh>;}
function Plant({x,z}:{x:number;z:number}){return <group position={[x,0,z]}><mesh position={[0,.23,0]}><cylinderGeometry args={[.19,.15,.45,8]}/><meshStandardMaterial color="#b09674"/></mesh><mesh position={[0,.62,0]}><icosahedronGeometry args={[.28,0]}/><meshStandardMaterial color="#627849"/></mesh></group>;}
function Avatar({id,x,z,status,selected,onSelect}:{id:AgentId;x:number;z:number;status:string;selected:boolean;onSelect:()=>void}){
  const a=agents[id],arm=useRef<Group>(null),person=useRef<Group>(null);
  useFrame(({clock})=>{if(arm.current)arm.current.rotation.x=status==='Working'?-.72+Math.sin(clock.elapsedTime*10)*.29:status==='Awaiting approval'?-2.6:0;if(person.current)person.current.position.y=selected?.09:0;});
  return <group position={[x,0,z]}>
    <Box p={[0,.72,0]} s={[id==='noura'?1.9:1.58,.12,.73]} c="#c8a781" onClick={onSelect}/>
    {[-.62,.62].flatMap(dx=>[-.27,.27].map(dz=><Box key={`${dx},${dz}`} p={[dx,.36,dz]} s={[.07,.71,.07]} c="#857255"/>))}
    <Box p={[-.17,.99,-.17]} s={[.55,.37,.05]} c="#485f50"/><Box p={[-.17,.99,-.137]} s={[.46,.28,.02]} c="#9dae9a"/>
    {id==='noura'&&<Box p={[.43,.98,-.17]} s={[.48,.38,.07]} c="#426155"/>}
    <Box p={[-.17,.79,.09]} s={[.49,.035,.18]} c="#f0ead4"/>
    <Box p={[0,.35,.65]} s={[.47,.13,.46]} c="#6c7462"/>
    <group position={[0,0,.62]} ref={person} onClick={e=>{e.stopPropagation();onSelect();}}>
      <Box p={[0,.67,0]} s={[.35,.46,.29]} c={a.color}/>
      <Box p={[-.111,.21,.03]} s={[.125,.39,.16]} c="#3d4940"/><Box p={[.111,.21,.03]} s={[.125,.39,.16]} c="#3d4940"/>
      <mesh position={[0,1.03,0]}><sphereGeometry args={[.18,12,9]}/><meshStandardMaterial color={['omar','adam','faisal'].includes(id)?'#bc8d6c':'#d7af86'}/></mesh>
      <mesh position={[0,1.112,-.027]}><sphereGeometry args={[.158,10,8]}/><meshStandardMaterial color={['sara','mariam','layla'].includes(id)?'#443934':'#363d31'}/></mesh>
      <group ref={arm} position={[.235,.79,0]}><Box p={[0,-.15,0]} s={[.13,.32,.14]} c={a.color}/></group>
      <Box p={[-.235,.64,0]} s={[.13,.32,.14]} c={a.color}/>
    </group>
    <Html center position={[0,1.61,.62]} zIndexRange={[8,1]}><button className={`avatar-label ${selected?'selected':''}`} onClick={onSelect}>{a.name}<small>{status}</small></button></Html>
  </group>;
}
function ContextLoss({fallback}:{fallback:()=>void}){
  const {gl}=useThree();
  useEffect(()=>{const lost=(e:Event)=>{e.preventDefault();fallback();};gl.domElement.addEventListener('webglcontextlost',lost);return()=>gl.domElement.removeEventListener('webglcontextlost',lost);},[gl,fallback]);
  return null;
}
function FitCamera(){
  const {camera,size}=useThree();
  useEffect(()=>{const c=camera as OrthographicCamera;c.zoom=Math.max(15,Math.min(38,size.width/15.8,size.height/10.2));c.updateProjectionMatrix();},[camera,size.width,size.height]);
  return null;
}
export default function Office3D({selected,status,onSelect,fallback}:{selected:AgentId;status:TeamStatus;onSelect:(id:AgentId)=>void;fallback:()=>void}){
  return <div className="office-3d"><Canvas orthographic camera={{position:[9,12,13],zoom:36,near:.1,far:60}} dpr={[1,1.4]} gl={{antialias:true,alpha:false,powerPreference:'low-power'}}>
    <color attach="background" args={['#e6ebdf']}/><ambientLight intensity={2}/><directionalLight position={[4,12,6]} intensity={2}/>
    <ContextLoss fallback={fallback}/><FitCamera/>
    <OrbitControls target={[0,.1,0]} minZoom={15} maxZoom={70} maxPolarAngle={Math.PI*.44} enableDamping enablePan={false}/>
    <Box p={[0,-.24,0]} s={[13.5,.45,8.2]} c="#a7a391"/><Box p={[0,-.045,0]} s={[13.35,.12,8.05]} c="#dacbb0"/>
    <Box p={[-4.72,.017,-2.12]} s={[3.4,.034,3.46]} c="#b5bd9c"/>
    <Box p={[-4.47,.016,2.38]} s={[3.88,.035,2.85]} c="#abb391"/>
    <Box p={[-.08,.016,2.85]} s={[3.55,.035,2]} c="#d4d4c1"/>
    <Box p={[4.35,.016,2.52]} s={[4.4,.035,2.75]} c="#c2c6b4"/>
    <Box p={[0,.51,-4]} s={[13.45,1.06,.13]} c="#a7aa97"/><Box p={[-6.65,.51,0]} s={[.13,1.06,8]} c="#a7aa97"/><Box p={[6.65,.27,0]} s={[.13,.56,8]} c="#a7aa97"/>
    <Box p={[-2.65,.48,-2.7]} s={[.12,.97,2.55]} c="#b5b39e"/><Box p={[-4.62,.42,.23]} s={[3.95,.86,.12]} c="#aab09a"/><Box p={[4.33,.28,1.26]} s={[4.7,.57,.12]} c="#a0a891"/>
    <Box p={[-5.2,.55,-3.67]} s={[1.8,1.08,.33]} c="#9d7953"/><Box p={[-5.1,.98,-.2]} s={[1.85,.82,.12]} c="#344b40"/><Box p={[-5.1,1,-.12]} s={[1.61,.62,.02]} c="#83a087"/>
    <Box p={[-1.19,.5,2.68]} s={[1.7,1,.65]} c="#b49674"/><Box p={[-1.43,1.02,2.65]} s={[.55,.09,.32]} c="#455d50"/>
    <mesh position={[-4.38,.57,2.47]}><cylinderGeometry args={[.85,.85,.14,22]}/><meshStandardMaterial color="#ad8965"/></mesh>
    <mesh position={[-4.38,.29,2.47]}><cylinderGeometry args={[.14,.29,.57,10]}/><meshStandardMaterial color="#8b7154"/></mesh>
    {Array.from({length:7},(_,i)=>{const a=i*2*Math.PI/7;return <Box key={i} p={[-4.38+Math.cos(a)*1.08,.27,2.47+Math.sin(a)*1.08]} s={[.36,.55,.34]} c="#6c785c"/>;})}
    {[[-6.18,-3.5],[6.16,-3.55],[6.15,3.53],[-6.15,3.52],[1.66,3.35],[-2.88,-.2]].map(([x,z])=><Plant key={`${x}-${z}`} x={x} z={z}/>)}
    <Html position={[-1.95,1.45,2.45]} center zIndexRange={[8,1]}><div className="avatar-label">Worldline News</div></Html>
    {desks.map(({id,x,y})=><Avatar key={id} id={id} x={(x-360)/44} z={(y-202)/45} status={status[id]} selected={selected===id} onSelect={()=>onSelect(id)}/>)}
  </Canvas></div>;
}
