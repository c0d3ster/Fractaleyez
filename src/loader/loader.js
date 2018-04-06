/**
 * This class provides a simple loader screen
 */
export class Loader
{
  /**
   * Append a very simple loader screen to the DOM
   * method loaded() has to be called to make the screen disappear
   * @param {string=} loadingText the text to be displayed on the loading screen
   */
  constructor( loadingText )
  {
    document.body.innerHTML+= `<div id="loader"><div class="loading-text">${loadingText || "LOADING"}</div></div>`;
    this.domElement = document.getElementById("loader");
    setTimeout(()=>{
      this.domElement.classList.add("loading");
    }, 10);
  }

  /**
   * This method has to be called to fade out the loading screen
   * It will then be removed from the DOM
   */
  loaded()
  {
    this.domElement.classList.remove('loading');
    this.domElement.classList.add('loaded');
    setTimeout(()=>{
      this.domElement.remove();
    }, 1000);
  }
};