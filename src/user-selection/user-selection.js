import AppConfig from '../config/app.config';
import { Loader } from '../loader/loader';

/**
 * Creates a pre-selection screen, handles its dom elements
 * and display an user interface for the audio stream selection
 */
export class UserSelection
{
  /**
   * Callback param 1: type of 
   * @param {*} callback The method to be called once the user has selected an option
   */
  constructor( callback )
  {
    this.loader = new Loader("LOADING LIBRARY");

    this.callback = callback;
    this.files = [];

    this.microphoneImg = new Image();
    this.microphoneImg.src = './dist/img/microphone.svg';

    this.loadLibraryFile().then( (library) => {
      
      library.forEach( (soundfile) => {
        this.files.push( new SoundFile(soundfile) );
      });
      this.loadCovers().then(()=>{ this.setupSelection(); });

    })
  }


  /**
   * Creates the dom elements and associate the events
   * to them
   */
  setupSelection()
  {
    this.loader.loaded();

    this.domElement = document.createElement("div");
    this.domElement.setAttribute('id', "user-selection");
    this.domElement.innerHTML = `
    <div class="track-selection">
      <div class="top-info">Select the track you'd wish to visualize<br>or drop an audio file into the window</div>
      <div class="tracks"></div>
    </div>`;

    if( AppConfig.hudToggleKey != false )
      this.domElement.innerHTML+= `<div class="bottom-infos">During the visualization, you can toggle the HUD by pressing ${AppConfig.hudToggleKey.toUpperCase()}</div>`;

    this.domElement.ondragenter = (e) => { e.preventDefault(); };
    this.domElement.ondragover = (e) => { e.preventDefault(); };
    this.domElement.ondrop = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.dropHandler(e); 
    };
    
    this.files.forEach( (file) => {
      let tracks = this.domElement.getElementsByClassName("tracks")[0];
      let track = document.createElement("div");
      track.setAttribute('class', 'track');
      track.innerHTML = `
        <div class="image" style="background-image: url(${file.image});"></div>
        <div class="track-infos">
          <span class="artist">${file.artist}</span> - <span class="track-name">${file.name}</span>
        </div>`;
      tracks.appendChild(track);
      track.addEventListener( "click", () => {
        this.loadFile( file );
      })
    });

    let micElem = document.createElement("div");
    micElem.setAttribute("class", "track microphone");
    micElem.innerHTML = `<div class="icon image" style="background-image: url(./dist/img/microphone.svg);"></div><div class="info-text">Use microphone as input</div>`;
    micElem.addEventListener( "click", () => {
      this.loadMicrophone();
    })
    this.domElement.getElementsByClassName("tracks")[0].appendChild(micElem);

    document.body.appendChild( this.domElement );
  }


  /** 
   * Hides the user selection and removes then elements from the DOM
   * @returns {Promise} resolves when the elements are hidden
   */
  clearSelection()
  {
    this.domElement.className+= " hide";

    return new Promise( (resolve) => {
      setTimeout(()=>{
        this.domElement.remove();
        resolve();
      }, 800);
    })
  }


  /**
   * Called when user selected a file from the library
   * Calls the callback method with the audio file to read
   */
  loadFile( file )
  {
    this.clearSelection().then( () => {
      this.callback( UserSelection.LOAD_TYPE.LIBRARY_FILE, `./dist/audio/${file.directory}/${file.filename}` );
    });
  }


  /**
   * Called when user selected microphone
   * Calls the callback method
   */
  loadMicrophone()
  {
    this.clearSelection().then( () => {
      this.callback( UserSelection.LOAD_TYPE.INPUT_MICROPHONE );
    });
  }


  /**
   * Called when user dropped an audio file 
   * Calls the callback method sending the file data to be read
   * @param {File} file The file buffer to be read
   */
  loadBuffer( file )
  {
    this.clearSelection().then( () => {
      this.callback( UserSelection.LOAD_TYPE.INPUT_FILE, file );
    });
  }


  /**
   * Handles the drop event trigger
   * @param {DragEvent} event 
   */
  dropHandler( event )
  {
    let fLoaded = false, file = null;

    if( event.dataTransfer.items )
    {
      let item = event.dataTransfer.items[0];
      if( item.kind === 'file' )
      {
        file = item.getAsFile();
        fLoaded = true;
      }
    }
    else 
    {
      file = event.dataTransfer.files[0];
      fLoaded = true;
    }

    if( fLoaded && file.type.indexOf("audio") != -1 )
    {
      this.loadBuffer(file);
    }
    else if( AppConfig.showerrors )
    {
      console.error( `The file is not an audio type.` );
    }
  }


  /**
   * Loads the library file 
   */
  loadLibraryFile()
  {
    return new Promise( (resolve, reject) => {
      let xhr = new XMLHttpRequest();
      xhr.responseType = 'text';
      xhr.open( "GET", "./dist/audio/sound-library.json", true );
      xhr.onloadend = () => {
        if( AppConfig.showloginfos ) console.log( `Library file loaded\n------------` );
        resolve( JSON.parse(xhr.response) );
      }
      xhr.onerror = () => {
        if( AppConfig.showerrors ) console.error( `Couldn't load the library file ./dist/audio/sound-library.json` );
        reject();
      }
      xhr.send();
    })
  }


  /**
   * Loads the images from the library
   * @returns {Promise} a promise which resolves once all the images are loaded
   */
  loadCovers()
  {
    let loaded = 0;
    return new Promise( (resolve, reject) => {
      this.files.forEach( (file) => {
        let image = new Image();
        image.onload = () => {
          loaded++;
          file.image = `./dist/audio/${file.directory}/${file.cover}`;
          if( loaded == this.files.length )
            resolve();
        }
        image.onerror = () => { 
          loaded++;
          file.image = '';
          if( AppConfig.showerrors ) console.error( `Couldn't load the cover /${file.directory}/${file.cover}` );
          if( loaded == this.files.length )
            resolve();
        };
        image.src = `./dist/audio/${file.directory}/${file.cover}`;
      });
    });
  }

  static get LOAD_TYPE()
  {
    return {
      LIBRARY_FILE: 0, INPUT_FILE: 1, INPUT_MICROPHONE: 2
    }
  }

};


/**
 * Very simple SoundFile structure, used to handle the
 * files from the library
 */
class SoundFile
{
  constructor( options )
  {
    this.name = "";
    this.directory = "";
    this.filename = "";
    this.cover = "cover.jpg";
    this.image = null;

    Object.assign( this, options );
  }
};