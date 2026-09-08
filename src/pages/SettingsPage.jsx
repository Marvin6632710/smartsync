import React from 'react'
import { Bell, MessageCircle, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function SettingsPage(){
  const navigate=useNavigate(); const {privacy,setPrivacy,resetPrototype}=useApp();
  return <div className="page-content"><BackButton/><h2>Settings</h2><div className="settings-card"><button className="setting-row" onClick={()=>navigate('/privacy')}><ShieldCheck/><span><strong>Privacy</strong><small>Anonymous mode and location controls</small></span><span>›</span></button><button className="setting-row" onClick={()=>navigate('/filters')}><SlidersHorizontal/><span><strong>Discovery preferences</strong><small>Category, distance and availability</small></span><span>›</span></button><button className="setting-row" onClick={()=>navigate('/messages')}><MessageCircle/><span><strong>Activity messages</strong><small>Temporary local conversations</small></span><span>›</span></button><button className="setting-row" onClick={()=>setPrivacy(p=>({...p,notifications:!p.notifications}))}><Bell/><span><strong>Notifications</strong><small>Local prototype notifications</small></span><span className={`switch ${privacy.notifications?'on':''}`}/></button></div><div className="panel danger-panel"><h3>Prototype data</h3><p className="helper-text">Reset localStorage data back to the original SmartSync demo content.</p><button className="danger-button wide" onClick={()=>{if(window.confirm('Reset SmartSync prototype data?'))resetPrototype()}}><RotateCcw size={17}/> Reset prototype</button></div></div>
}
