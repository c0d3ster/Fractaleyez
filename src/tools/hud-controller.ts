import { userConfig as UserConfig } from '../config/user.config'

interface HudElement {
  toggle(show: boolean): void
}

export class HUD {
  private elements: HudElement[]
  private show: boolean

  constructor() {
    this.elements = []
    this.show = UserConfig.hudDisplayed

    document.addEventListener('keydown', (event) => {
      this.keyDownEvent(event)
    })
  }

  add(element: HudElement): void {
    this.elements.push(element)
    element.toggle(this.show)
  }

  keyDownEvent(event: KeyboardEvent): void {
    if (event.key === UserConfig.hudToggleKey) {
      event.stopPropagation()
      this.show = !this.show
      this.elements.forEach((elem) => {
        elem.toggle(this.show)
      })
    }
  }
}
