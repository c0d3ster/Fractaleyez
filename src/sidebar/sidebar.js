import appConfig from '../config/app.config';
import analyserConfig from '../config/analyser.config.js';
import visualizerConfig from '../config/visualizer.config.js';

import './sidebar.css';

export default class Sidebar {
  constructor() {
    this.$container = null;
    this.$sidebar = null;
    this.$button = null;
  }

  init() {
    this.$container = $(`<div class='sidebar-container'></div>`);
    this.$sidebar = $(`<div class='sidebar'></div>`);
    $( document.body ).append(this.$container);
    this.$container.append(this.$sidebar);
  }
}
