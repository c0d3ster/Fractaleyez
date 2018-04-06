import StatsJS from 'stats-js';
import AppConfig from '../config/app.config';


/**
 * This class provides an abstraction for controlling stats
 */
export class Stats
{
  /**
   * @param {number=} position 0: top-left / 1: top-right / 2: bottom-left / 3: bottom-right (optional)
   */
  constructor( position )
  {
    if( typeof(position) == "undefined" )
      position = 0;
    
    this.stats = new StatsJS();
    this.stats.domElement.style.position = "absolute";

    switch( position )
    {
      case 1:
        this.stats.domElement.style.right = "0";
      case 0:
        this.stats.domElement.style.top = "0";
        break;
      case 3: 
        this.stats.domElement.style.right = "0";
      case 2:
        this.stats.domElement.style.bottom = "0";
        break;
    }

    document.body.appendChild( this.stats.domElement );
    if( AppConfig.showloginfos ) console.log(`Stats initiliazed\n------------`);
  }


  /**
   * hide/show the HUD
   * @param {boolean} show
   */
  toggle( show )
  {
    if( show && this.stats.domElement.hasAttribute("hidden") )
      this.stats.domElement.removeAttribute("hidden");
    else if( !show )
      this.stats.domElement.setAttribute("hidden", true);
  }


  /**
   * Positions
   */
  static get POSITIONS()
  {
    return {
      TOP_LEFT: 0, TOP_RIGHT: 1, BOTTOM_LEFT: 2, BOTTOM_RIGHT: 3
    }
  }

  /**
   * needs to be called when a stat analysis is desired
   */
  begin()
  {
    this.stats.begin();
  }

  /**
   * needs to be called when a stat analysis is done
   */
  end()
  {
    this.stats.end();
  }
}