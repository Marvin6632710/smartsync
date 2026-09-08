import React from 'react'
import BackButton from '../components/BackButton'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'

export default function JoinedActivitiesPage(){
 const {recommendations,joinedIds}=useApp(); const joined=recommendations.filter(a=>joinedIds.includes(a.id)); return <div className="page-content"><BackButton/><span className="eyebrow">Your activity history</span><h2>Joined activities</h2><div className="stack">{joined.map(a=><ActivityCard key={a.id} activity={a}/>)}{joined.length===0&&<div className="empty-state"><h3>No joined activities</h3><p>Join an activity from discovery to see it here.</p></div>}</div></div>
}
