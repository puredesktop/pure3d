import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WhiteNeutral } from './whiteNeutral'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Pure3D root element not found')
createRoot(root).render(
  <>
    <WhiteNeutral />
    <App />
  </>,
)
