import { accordion } from 'jquery-ui/ui/widgets/accordion';
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';

import './sidebar.css';
import config from '../config/configuration';


/* The Sidebar component contains all options for the Visualization
 * Options are split into tabs for presets, audio, and visualization
 *
 */
export default class Sidebar {
  constructor() {
    this.$container = null;
    this.$sidebar = null;
    this.$tab= null;
    this.$config = null;
    this.hideTimer = null;
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
    if(this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.$tab.removeClass('tab-fade-out');
    this.$tab.addClass('tab-fade-in');
  }

  //override event param with custom waitTime functionality
  hideTabDelayed = (waitTime) => {
    if(!this.hideTimer)
      this.hideTimer = window.setTimeout(() => {
        this.$tab.removeClass('tab-fade-in');
        this.$tab.addClass('tab-fade-out');
      }, Number.isInteger(waitTime) ? waitTime : 1000);
  }

  init() {
    //create and append sidebar elements then hide tab after 3 seconds
    this.$container = $(`<div class='sidebar-container'></div>`);
    this.$sidebar = $(`<div class='sidebar'></div>`);
    this.$tab = $(`<button class='tab'>Menu</button>`);
    this.$config = $(`<div class='config'></div>`)
    $( document.body ).append(this.$container);
    this.$container.append(this.$sidebar);
    this.$sidebar.append(this.$tab);
    this.$sidebar.append($(`<h2 class='sidebar-title'>CONFIGURATION</h2>`));
    this.$sidebar.append(this.$config);
    this.hideTabDelayed(3000);

    //set up event listeners for animations
    this.$tab.click(this.toggleSidebar);
    this.$container.mouseenter(this.showTab);
    this.$container.mouseleave(this.hideTabDelayed);

    for (let category in config) {
      this.$config.append($(`<h3 class='config-title'>${category} config</h3>`)); //create category header
      let $category = $(`<div></div>`);
      this.$config.append($category);
      console.log(`Category is: ${category}`);
      for (let option in config[category]) {
        $category.append($(`<h4>${option}</h4>`));
        console.log(option);
        console.log(config[category][option]);
        //if type == slider make slider element
      }
    }
    $( 'canvas' )
    console.log(this.categories);

    $( ".config" ).accordion({
      collapsible: true
    });

  }
}
