import AppConfig from '../config/app.config';


/**
 * Handles the elements from the HUD
 */
export class HUD
{
  constructor()
  {
    this.elements = [];
    this.show = AppConfig.hudDisplayed;

    document.addEventListener( "keydown", (event) => {
      this.keyDownEvent(event);
    });
  }


  /**
   * Adds an element to the HUD
   * @param {*} element the element MUST implement the method toggle()
   */
  add( element )
  {
    this.elements.push( element );
    element.toggle( this.show );
  }


  /**
   * 
   * @param {KeyboardEvent } event 
   */
  keyDownEvent( event )
  {
    if( event.key == AppConfig.hudToggleKey )
    {
      event.stopPropagation();
      this.show = !this.show;
      this.elements.forEach( (elem) => {
        elem.toggle( this.show );
      })
    }
  }
};