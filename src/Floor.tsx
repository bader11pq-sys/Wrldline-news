import {agents} from '../shared/agents';
import type {AgentId} from '../shared/schema';
export type TeamStatus=Record<AgentId,string>;
export const desks:{id:AgentId;x:number;y:number}[]=[
  {id:'omar',x:146,y:116},{id:'sara',x:315,y:91},{id:'khalid',x:438,y:91},{id:'layla',x:560,y:91},
  {id:'adam',x:315,y:184},{id:'faisal',x:438,y:184},{id:'mariam',x:560,y:184},{id:'noura',x:557,y:303}
];
export const initials=(s:AgentId)=>agents[s].initials;
const Plant=({x,y,big=false}:{x:number;y:number;big?:boolean})=><g transform={`translate(${x} ${y}) scale(${big?1.3:1})`}><ellipse cy="4" rx="12" ry="9" fill="#564938" opacity=".22"/><circle r="9" fill="#ad997b"/><circle r="7" fill="#6a7550"/><path d="M0 1Q-15-10-5-9Q4-9 0 1M0 1Q3-14 8-8Q12-3 0 1M0 1Q14 0 8 7Q4 11 0 1M0 1Q-14-1-9 6Q-5 11 0 1" fill="#899568"/><circle r="2" fill="#d1d0a5"/></g>;
const Wall=({x,y,w,h}:{x:number;y:number;w:number;h:number})=><g><rect x={x} y={y+4} width={w} height={h} fill="#6c6b57" opacity=".24"/><rect x={x} y={y} width={w} height={h} rx="1.5" fill="#9a9c86"/><path d={`M${x} ${y}h${w}`} stroke="#f7f4e6" strokeWidth="2"/></g>;
const Chair=({x,y,r=0,c='#676e5c'}:{x:number;y:number;r?:number;c?:string})=><g transform={`translate(${x} ${y}) rotate(${r})`}><rect x="-11" y="-7" width="22" height="14" rx="5" fill="#4f4a41" opacity=".18"/><rect x="-9" y="-8" width="18" height="12" rx="4.5" fill={c}/><rect x="-10" y="3" width="20" height="4" rx="2" fill="#49483d"/><path d="M-7 -4H7" stroke="#fff" opacity=".25" /></g>;
export default function Floor({selected,status,onSelect}:{selected:AgentId;status:TeamStatus;onSelect:(id:AgentId)=>void}){
  return <div className="floor-wrap"><svg className="floor" viewBox="0 0 720 421" aria-label="Interactive floor plan for all eight employees">
    <defs>
      <pattern id="wood" width="31" height="10" patternUnits="userSpaceOnUse"><rect width="31" height="10" fill="#ded0b8"/><path d="M0 .5H31M18 .5v9" stroke="#b8a687" opacity=".34"/><path d="M4 4h14m6 4h5" stroke="#f5ead1" opacity=".66"/></pattern>
      <pattern id="papergrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#d5d9c8" strokeWidth=".75"/></pattern>
      <pattern id="tile" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#d6d4c1"/><path d="M0 0H22V22" stroke="#b6b7a6" opacity=".55" fill="none"/></pattern>
      <pattern id="rug" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#b7bc9f"/><path d="M0 0l8 8M8 0L0 8" stroke="#edf0d7" opacity=".22"/></pattern>
      <linearGradient id="drift"><stop stopColor="#e6ebde"/><stop offset="1" stopColor="#f0f0e6"/></linearGradient>
      <filter id="under" x="-20%" width="140%" y="-30%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#415442" floodOpacity=".19"/></filter>
    </defs>
    <rect width="720" height="421" fill="url(#drift)"/><rect width="720" height="421" fill="url(#papergrid)"/>
    <path d="M30 31h16m-8-8v16m636-8h16m-8-8v16M30 391h16m-8-8v16m636-8h16m-8-8v16" stroke="#9cae99" opacity=".55"/>
    <g filter="url(#under)"><rect x="65" y="37" width="590" height="340" rx="3" fill="#a5a18b"/><rect x="73" y="45" width="574" height="324" fill="url(#wood)"/>
    <rect x="77" y="48" width="158" height="171" fill="#e9dbc4" opacity=".64"/><rect x="77" y="226" width="191" height="140" fill="url(#rug)"/><rect x="277" y="274" width="165" height="91" fill="url(#tile)"/><rect x="452" y="267" width="192" height="97" fill="#b9bcae" opacity=".62"/>
    <rect x="277" y="261" width="368" height="8" fill="#b8ab94" opacity=".55"/>
    <rect x="95" y="77" width="109" height="96" rx="3" fill="url(#rug)"/><rect x="98" y="80" width="103" height="90" rx="2" fill="none" stroke="#e1dfc7"/>
    <Wall x={65} y={37} w={590} h={8}/><Wall x={65} y={37} w={8} h={340}/><Wall x={647} y={37} w={8} h={340}/><Wall x={65} y={369} w={249} h={8}/><Wall x={390} y={369} w={265} h={8}/>
    <Wall x={235} y={45} w={7} h={141}/><Wall x={235} y={211} w={7} h={15}/><Wall x={73} y={219} w={162} h={7}/><Wall x={73} y={361} w={7} h={8}/>
    <Wall x={268} y={227} w={7} h={71}/><Wall x={268} y={328} w={7} h={42}/><Wall x={440} y={269} w={7} h={32}/><Wall x={440} y={331} w={7} h={38}/><Wall x={447} y={260} w={200} h={7}/>
    <path d="M86 42h121m62 0h360m21 10v179" stroke="#c9dcd7" strokeWidth="4"/><path d="M97 42h97m89 0h332m35 25v150" stroke="#edf7ec" strokeWidth="1.4"/>
    <path d="M312 370h80m-80 5h80" stroke="#c3c9b3" strokeWidth="2"/>
    <g><rect x="84" y="57" width="69" height="12" rx="2" fill="#a88661"/><path d="M91 60v6m5-6v6m6-7v7m8-7v7m8-6v6m4-7v7m7-7v7m8-6v6m7-7v7" stroke="#e5d6ad" strokeWidth="3"/>
    <rect x="86" y="190" width="108" height="15" rx="2" fill="#a6815e"/><rect x="105" y="179" width="68" height="17" rx="2" fill="#34463b"/><rect x="109" y="182" width="60" height="7" rx="1" fill="#6d8f77"/><path d="M116 185h10m3 0h17m4 0h14" stroke="#b6cbab" strokeWidth="1.5"/>
    <Plant x={210} y={61}/><Plant x={216} y={203}/><Plant x={629} y={63}/><Plant x={629} y={241}/><Plant x={84} y={351}/><Plant x={632} y={350}/><Plant x={414} y={351} big/></g>
    <g><rect x="90" y="235" width="19" height="62" rx="4" fill="#777c5c"/><rect x="93" y="239" width="13" height="54" rx="3" fill="#949977"/><path d="M94 255h12m-12 18h12" stroke="#d4d4b3" opacity=".5"/>
    <Chair x={171} y={245} r={180}/><Chair x={139} y={259} r={135}/><Chair x={205} y={259} r={220}/><Chair x={127} y={289} r={90}/><Chair x={215} y={288} r={-90}/><Chair x={139} y={318} r={45}/><Chair x={205} y={318} r={-45}/><Chair x={171} y={330}/>
    <circle cx="172" cy="290" r="39" fill="#66553e" opacity=".26"/><circle cx="171" cy="286" r="37" fill="#ad8864"/><circle cx="171" cy="286" r="34" fill="#caa983"/><circle cx="171" cy="286" r="14" fill="#d9bd95"/><path d="M144 270l11 5m36-5l-8 7m-29 26l10-7m22-1l9 7" stroke="#ece2c6" strokeWidth="4" strokeLinecap="round"/>
    <rect x="291" y="285" width="72" height="24" rx="3" fill="#8c7359"/><rect x="291" y="283" width="72" height="21" rx="3" fill="#b0916f"/><rect x="298" y="289" width="27" height="8" rx="1.5" fill="#3d5246"/><circle cx="351" cy="293" r="3" fill="#d3c5a3"/><rect x="291" y="327" width="68" height="26" rx="3" fill="#d2cabb" stroke="#bab5a2"/><path d="M298 334h55m-55 5h55m-55 5h55" stroke="#ada993" opacity=".55"/>
    <rect x="458" y="278" width="17" height="63" rx="3" fill="#7f8880"/><path d="M463 285v48m5-48v48" stroke="#aab4a6" opacity=".6"/></g>
    {desks.map(({id,x,y})=>{
      const chief=id==='omar', developer=id==='noura', width=chief?84:developer?86:69, c=agents[id].color, is=selected===id;
      return <g key={id} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`${agents[id].name}, ${status[id]}`} onClick={()=>onSelect(id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(id);}}} className="station">
        <rect x={-width/2-11} y="-32" width={width+22} height="74" rx="10" fill={is?'#eef3db':'transparent'} fillOpacity=".57" stroke={is?'#527052':'transparent'} strokeDasharray="4 3"/>
        <Chair x={0} y={19} c={c}/>
        <rect x={-width/2} y="0" width={width} height={chief?22:19} rx="3" fill="#73664e" opacity=".42"/>
        <rect x={-width/2} y="-4" width={width} height={chief?22:19} rx="3" fill={chief?'#a47d56':'#c19e77'} />
        <rect x={-width/2+2} y="-3" width={width-4} height={chief?19:16} rx="2.2" fill={chief?'#ba9870':'#d1b28a'}/>
        <rect x={developer?-27:-19} y="0" width={developer?22:27} height="5" rx="1" fill="#334940"/><rect x={developer?-25:-17} y="1" width={developer?18:23} height="2" rx=".6" fill="#91a693"/>
        {developer&&<rect x="0" y="0" width="22" height="5" rx="1" fill="#405e51"/>}
        <rect x={developer?-18:-12} y="7" width="17" height="4" rx="1" fill="#e7ddc8"/><circle cx={width/2-9} cy="7" r="3" fill="#eee2c8"/><path d={`M${-width/2+6} 6v4`} stroke="#896e54" strokeWidth="2"/>
        <circle cy="19" r="8" fill={c} stroke="#f8f1df" strokeWidth="1.6"/><circle cy="17" r="3.7" fill={chief?'#d9a779':'#d1ac89'}/>
        <rect x="-31" y="-26" width="62" height="19" rx="9.5" fill={is?'#285640':'#fbf9ed'} stroke={is?'#285640':'#c4c7ae'} />
        <circle cx="-20" cy="-16.5" r="2.7" fill={status[id]==='Working'?'#c9a354':status[id]==='Awaiting approval'?'#dc9a58':is?'#b4d09e':'#6b9977'}/>
        <text y="-13.1" x="3.5" textAnchor="middle" fill={is?'#fff':'#25392d'} fontSize="9.5" fontWeight="700">{agents[id].name}</text>
      </g>;
    })}
    </g>
    <g className="room-label"><text x="89" y="85">CEO OFFICE</text><text x="274" y="56">NEWSROOM</text><text x="119" y="350">MEETING ROOM</text><text x="315" y="321">RECEPTION</text><text x="487" y="355">DEVELOPER STUDIO</text></g>
    <path d="M343 385h18m-14 4h10" stroke="#7c8e78" strokeWidth="1" opacity=".7"/>
    <text x="353" y="406" textAnchor="middle" className="blueprint">WORLDLINE • FLOOR 01</text>
    <g transform="translate(678 349)" opacity=".8"><path d="M0 15V-3m-4 5L0-3l4 5" stroke="#6f806b" fill="none"/><text x="0" y="-8" textAnchor="middle" className="blueprint">N</text></g>
  </svg></div>;
}
