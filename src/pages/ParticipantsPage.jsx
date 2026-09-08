import React from 'react'
import { useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { mockUsers } from '../data/mockData'

export default function ParticipantsPage(){
  const {id}=useParams(); const {activities,joinedIds,user,privacy}=useApp(); const a=activities.find(x=>x.id===id)
  if(!a)return <div className="page-content"><BackButton/><div className="empty-state"><h3>Activity not found</h3></div></div>
  const participants=mockUsers.filter(u=>(a.joinedUserIds||[]).includes(u.id)); if(joinedIds.includes(id)) participants.push({...user,name:privacy.anonymousMode?'Anonymous participant':user.name})
  return <div className="page-content"><BackButton/><span className="eyebrow">{a.title}</span><h2>Participants</h2><p className="helper-text">{a.participants}/{a.capacity} spots are currently represented in the prototype.</p><div className="stack">{participants.map((p,index)=><div className="person-card" key={`${p.id}-${index}`}><div className="avatar">{p.avatar||'AN'}</div><div><h3>{p.name}</h3><p>{(p.interests||[]).slice(0,3).join(' · ')||'Activity participant'}</p></div></div>)}{a.participants>participants.length&&<div className="panel"><p className="helper-text">+ {a.participants-participants.length} additional mock participants represented by the participant count.</p></div>}</div></div>
}
