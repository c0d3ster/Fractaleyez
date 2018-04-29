import appConfig from '../config/app.config';
import analyserConfig from '../config/analyser.config.js';
import visualizerConfig from '../config/visualizer.config.js';

import './sidebar.css';

/* The Sidebar component contains all options for the Visualization
 * Options are split into tabs for presets, audio, and visualization
 *
 */
export default class Sidebar {
  constructor() {
    this.$container = null;
    this.$sidebar = null;
    this.$tab= null;
    this.hideTimer = null;
    this.options= [];
  }

  toggleSidebar = () => {
    if(this.$sidebar.hasClass('slide-in')) {
      this.$sidebar.removeClass('slide-in');
      this.$sidebar.addClass('slide-out');
    }
    else {
      this.$sidebar.addClass('slide-in');
      this.$sidebar.removeClass('slide-out');
    }
  }

  showTab = () => {
    console.log(this.hideTimer);
    if(this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.$tab.removeClass('tab-fade-out');
    this.$tab.addClass('tab-fade-in');
  }

  hideTabDelayed = (waitTime) => {
    if(!this.hideTimer)
      this.hideTimer = window.setTimeout(() => {
        this.$tab.removeClass('tab-fade-in');
        this.$tab.addClass('tab-fade-out');
        console.log(this.$tab);
      }, waitTime || 1000);
  }

  init() {
    //create and append sidebar elements then hide tab after 3 seconds
    this.$container = $(`<div class='sidebar-container'></div>`);
    this.$sidebar = $(`<div class='sidebar'></div>`);
    this.$tab = $(`<button class='tab'>Menu</button>`);
    $( document.body ).append(this.$container);
    this.$container.append(this.$sidebar);
    this.$sidebar.append(this.$tab);
    this.hideTabDelayed(3000);

    //set up event listeners for animations
    this.$tab.click(this.toggleSidebar);
    this.$container.mouseenter(this.showTab);
    this.$container.mouseleave(this.hideTabDelayed);
    this.$sidebar.mouseenter(this.showTab);
    this.$sidebar.mouseleave(this.hideTabDelayed);

  }
}
