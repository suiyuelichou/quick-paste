import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './enhancements.css'

const view = new URLSearchParams(window.location.search).get('view') === 'picker' ? 'picker' : 'manager'
document.documentElement.dataset.view = view

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
