import StatsJS from 'stats-js'
import { userConfig as UserConfig } from '../config/user.config'

export class Stats {
  private stats: InstanceType<typeof StatsJS>

  static get POSITIONS(): { TOP_LEFT: 0; TOP_RIGHT: 1; BOTTOM_LEFT: 2; BOTTOM_RIGHT: 3 } {
    return { TOP_LEFT: 0, TOP_RIGHT: 1, BOTTOM_LEFT: 2, BOTTOM_RIGHT: 3 }
  }

  constructor(position = 0) {
    this.stats = new StatsJS()
    this.stats.domElement.style.position = 'absolute'

    switch (position) {
    case 1:
      this.stats.domElement.style.right = '0'
      // falls through
    case 0:
      this.stats.domElement.style.top = '0'
      break
    case 3:
      this.stats.domElement.style.right = '0'
      // falls through
    case 2:
      this.stats.domElement.style.bottom = '0'
      break
    }

    document.body.appendChild(this.stats.domElement)
    if (UserConfig.showloginfos) console.info('Stats initiliazed\n------------')
  }

  toggle(show: boolean): void {
    if (show && this.stats.domElement.hasAttribute('hidden'))
      this.stats.domElement.removeAttribute('hidden')
    else if (!show)
      this.stats.domElement.setAttribute('hidden', 'true')
  }

  begin(): void {
    this.stats.begin()
  }

  end(): void {
    this.stats.end()
  }
}
