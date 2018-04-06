import dat from 'dat.gui';
import AppConfig from '../config/app.config';


/**
 * This class provides an abstraction for a GUI utilisation
 */
export class GUI
{
  /**
   * @param {boolean=} closed If the GUI is closed or not (optional)
   */
  constructor( controls, closed )
  {
    this.gui = new dat.GUI();
    this.controllers = {};

    this.parseControls( this.gui, controls );

    if( closed === true )
      this.gui.close();

    if( AppConfig.showloginfos ) console.log(`UI controls initialiazed\n------------`);
  }


  /**
   * hide/show the HUD
   * @param {boolean} show
   */
  toggle( show )
  {
    if( show && this.gui.domElement.hasAttribute("hidden") )
      this.gui.domElement.removeAttribute("hidden");
    else if( !show )
      this.gui.domElement.setAttribute("hidden", true);
  }


  /**
   * Parse the controls, from user-controls, to set up the dat.gui
   */
  parseControls( gui, controls )
  {
    controls.forEach( (control) => {

      // first case, it's a folder
      if( Array.isArray(control) && typeof control[0] === "string" )
      {
        let copy = control.slice(0);
        copy.shift();
        this.controllers[control[0]] = gui.addFolder(control[0]);
        this.parseControls( this.controllers[control[0]], copy );
      }

      else if( control.type === "color" ) // it's a color
      {
        this.controllers[control.property] = gui.addColor( control.object, control.property );
        if( typeof control.callback != "undefined" )
          this.controllers[control.property].onFinishChange( control.callback );
      }

      else if( typeof control.object[control.property] === "string" || typeof control.object[control.property] === "boolean" ) // it's a string or a string, same logic
      {
        this.controllers[control.property] = gui.add( control.object, control.property );
        if( typeof control.callback != "undefined" )
          this.controllers[control.property].onFinishChange( control.callback );
      }
      
      else // it's a number property 
      {
        let properties = Object.assign({ min: 0, max: 100, step: 1}, control);
        this.controllers[control.property] = gui.add( control.object, control.property, properties.min, properties.max, properties.step );
        if( typeof properties.callback != "undefined" )
          this.controllers[control.property].onFinishChange( properties.callback );
      }

    });
  }


  /**
   * Adds a new controller to the GUI
   * @param {string} id Unique string identifier to the property
   * @param {Object} object Object containing the property value
   * @param {string} property Property of the object
   * @param {number} min
   * @param {number} max 
   * @param {number} step 
   * @param {*=} callbackOnChanged Callback function on changed value
   */
  add( id, object, property, min, max, step, callbackOnChanged )
  {
    let controller = this.gui.add( object, property, min, max );
    controller.step( step );
    if( typeof(callbackOnChanged) != "undefined" )
      controller.onFinishChange( callbackOnChanged );
    this.controllers[id] = controller;
  }


  /**
   * Adds a folder to the GUI
   * @param {string} id Unique string identifier to the folder
   * @param {string} name Name displayed
   */
  addFolder( id, name )
  {
    this.controllers[id] = this.gui.addFolder(name);
  }


  /**
   * Adds a new controller to the folder
   * @param {string} folderId Unique id of the folder
   * @param {string} id Unique string identifier to the property
   * @param {Object} object Object containing the property value
   * @param {string} property Property of the object
   * @param {number} min
   * @param {number} max 
   * @param {number} step 
   * @param {*=} callbackOnChanged Callback function on changed value
   */
  addToFolder( folderId, id, object, property, min, max, step, callbackOnChanged )
  {
    let controller = this.controllers[folderId].add( object, property, min, max );
    controller.step( step );
    if( typeof(callbackOnChanged) != "undefined" )
      controller.onFinishChange( callbackOnChanged );
    this.controllers[id] = controller;
  }


  /**
   * Add a color controller to the GUI
   * @param {string} id Unique ID for the color
   * @param {Object} object Object containing the property value
   * @param {string} property The property that will handle the value
   */
  addColor( id, object, property )
  {
    this.controllers[id] = this.gui.addColor( object, property );
  }


  /**
   * Add a color controller to the GUI
   * @param {string} folderId Unique id of the folder
   * @param {string} id Unique ID for the color
   * @param {Object} object Object containing the property value
   * @param {string} property The property that will handle the value
   */
  addColorToFolder( folderId, id, object, property )
  {
    this.controllers[id] = this.controllers[folderID].addColor( object, property );
  }
  
};