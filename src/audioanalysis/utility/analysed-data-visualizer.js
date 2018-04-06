import AppConfig from '../../config/app.config';
import AnalyserConfig from '../../config/analyser.config';

import { AudioAnalysedData } from '../audio-analysed-data';


/**
 * This values are used to set the position/size of the differents
 * pannels
 */
const 
PANNEL_SIGNAL = {
  pos_x: 0, pos_y: 0, size_x: 256, size_y: 128
},
PANNEL_SPECTRUM = {
  pos_x: 256, pos_y: 0, size_x: 256, size_y: 128
},
PANNEL_ENERGY = {
  pos_x: 512, pos_y: 0, size_x: 256, size_y: 128
},
PANNEL_MULTIBAND_ENERGIES = {
  pos_x: 0, pos_y: 128, size_x: 1024, size_y: 125
},
PANNEL_ALGO_1 = {
  pos_x: 0, pos_y: 300, size_x: 1024, size_y: 40
},
PANNEL_ALGO_2 = {
  pos_x: 0, pos_y: 357, size_x: 1024, size_y: 400
};


/**
 * Provides a visual guidance to what the analysis is doing 
 * This should only be used in development since this is only 
 * non-optimized helper
 */
export class AnalysedDataVisualizer
{
  /** */
  constructor()
  {
    this.canvas = null;
    this.context = null;
    this.frame = 0;
  }


  /**
   * Add a canvas to the body
   * This canvas will be used by the draw() function
   */
  init()
  {
    this.canvas = document.createElement( "canvas" );
    this.canvas.setAttribute( "width", 1025 );
    this.canvas.setAttribute( "height", 1024 );
    document.body.appendChild( this.canvas );
    this.context = this.canvas.getContext( "2d" );
    if( AppConfig.showloginfos ) console.log( `Visualizer initialized\n------------` );
  }


  /**
   * This method needs to be called each frame 
   * @param {AudioAnalysedData} analysedData Data processed by the AudioAnalyser
   * @param {*} startTimer Start timer of the visualization
   */
  draw( analysedData, startTimer )
  {
    this.frame++;

    // we clear the canvas
    this.context.clearRect( 0, 0, this.canvas.width, this.canvas.height );
    this.context.fillStyle = "black";
    this.context.fillRect( 0, 0, this.canvas.width, this.canvas.height );

    this.drawSignal( analysedData.getTimedomainData() );
    this.drawSpectrum( analysedData.getFrequenciesData() );
    this.drawEnergyHistogram( analysedData.getEnergyHistory(), analysedData.getEnergyAverage() );
    this.drawPeakDetection( analysedData.peak, analysedData.peakHistory, startTimer );
    this.drawMultibandHistogram( analysedData.getMultibandEnergyHistory() );
    this.drawMultibandPeakDetection( analysedData.multibandPeak, analysedData.multibandPeakHistory, startTimer );

    this.context.strokeStyle = "red";
    this.context.lineWidth = 1;
    this.context.strokeRect(0,0,1024,1024);
  }


  /**
   * Draws the audio signal,
   * using time domain data
   * @param {Uint8Array} timedomaindata
   */
  drawSignal( timedomaindata )
  {
    // first we draw the interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( PANNEL_SIGNAL.pos_x+0.5, PANNEL_SIGNAL.pos_y+0.5, PANNEL_SIGNAL.size_x, PANNEL_SIGNAL.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'white';
    this.context.fillText( 'Unprocessed signal', PANNEL_SIGNAL.pos_x+5, PANNEL_SIGNAL.pos_y + 13 );

    // x axis
    this.context.beginPath();
    this.context.moveTo( PANNEL_SIGNAL.pos_x, PANNEL_SIGNAL.pos_y + PANNEL_SIGNAL.size_y/2 );
    this.context.lineTo( PANNEL_SIGNAL.pos_x + PANNEL_SIGNAL.size_x, PANNEL_SIGNAL.pos_y + PANNEL_SIGNAL.size_y/2 );
    this.context.strokeStyle = 'blue';
    this.context.stroke();
    this.context.closePath();

    // drawing the signal
    this.context.beginPath();

    let aspectRatio_x = PANNEL_SIGNAL.size_x / timedomaindata.length,
        aspectRatio_y = PANNEL_SIGNAL.size_y / 256;
    
    for( let i = 0; i < timedomaindata.length; i++ )
      this.context.lineTo( i * aspectRatio_x + PANNEL_SIGNAL.pos_x, (PANNEL_SIGNAL.pos_y+PANNEL_SIGNAL.size_y-timedomaindata[i]*aspectRatio_y) );

    this.context.strokeStyle = 'white';
    this.context.stroke();
    this.context.closePath();
  }


  /**
   * Draws the frequencies data
   * @param {Uint8Array} frequencyData 
   */
  drawSpectrum( frequencyData )
  {
    let pannel = PANNEL_SPECTRUM;

    // d'abord on dessine l'interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( pannel.pos_x+0.5, pannel.pos_y+0.5, pannel.size_x, pannel.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'white';
    this.context.fillText( 'Signal spectrum', pannel.pos_x+5, pannel.pos_y + 13 );

    let freqWidth = pannel.size_x / frequencyData.length,
        heightRatio = pannel.size_y / 255;

    for( let i = 0; i < frequencyData.length; i++ )
    {
      this.context.fillStyle = `hsl(${i/frequencyData.length*180}, 100%, 50%)`;
      this.context.fillRect( pannel.pos_x+freqWidth*i+1, pannel.pos_y+pannel.size_y-frequencyData[i]*heightRatio, freqWidth, frequencyData[i]*heightRatio);
    }
  }


  /**
   * Draw the energy histogram.
   * This histogram is used by the peak detection algorithm
   * @param {Array} energyHistory History of the energies
   * @param {number} energyAverage The local average energy
   */
  drawEnergyHistogram( energyHistory, energyAverage )
  {
    let rect = PANNEL_ENERGY;

    // first we draw the interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( rect.pos_x+0.5, rect.pos_y+0.5, rect.size_x, rect.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'red';
    this.context.fillText( 'Moment energy', rect.pos_x+5, rect.pos_y + 13 );
    this.context.fillStyle = 'white';
    this.context.fillText( 'on signal compared to', rect.pos_x+107, rect.pos_y + 13 );
    this.context.fillStyle = '#00ff00';
    this.context.fillText( 'local average energy', rect.pos_x+5, rect.pos_y + 27 );

    // average of the histogram 
    this.context.beginPath();
    this.context.moveTo( rect.pos_x+rect.size_x, rect.pos_y+rect.size_y - energyAverage );
    this.context.lineTo( rect.pos_x+rect.size_x - energyHistory.length*2, rect.pos_y+rect.size_y - energyAverage );
    this.context.strokeStyle = '#00ff00';
    this.context.stroke();
    this.context.closePath();

    // we draw it 
    this.context.beginPath();
    
    for( let i = 0; i < energyHistory.length; i++ )
      this.context.lineTo( rect.pos_x+rect.size_x - i*2, rect.pos_y+rect.size_y - energyHistory[energyHistory.length-i-1] );
    this.context.strokeStyle = 'red';
    this.context.stroke();
    this.context.closePath();
  }


  /**
   * Draws a timeline with all the detected peaks
   * @param {Peak} peak Current peak used to real-time peak detection
   * @param {Array} peakHistory Array of all the detected peaks
   * @param {*} startTimer Absolute timer of the beginning of analysis
   */
  drawPeakDetection( peak, peakHistory, startTimer )
  {
    let rect = PANNEL_ALGO_1;
    // d'abord on dessine l'interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( rect.pos_x+0.5, rect.pos_y+0.5, rect.size_x, rect.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'white';
    this.context.fillText( `ALGO1 / threshold: ${AnalyserConfig.options.peakDetection.options.threshold} / ignoreTime: ${AnalyserConfig.options.peakDetection.options.ignoreTime} / results: ${peakHistory.length}`, rect.pos_x+5, rect.pos_y - 2 );

    
    for( let i = 0; i < peakHistory.length; i++ )
    {
      this.context.beginPath();
      this.context.moveTo( rect.pos_x + (peakHistory[i].timer - startTimer)/1000*3, rect.pos_y + rect.size_y );
      this.context.lineTo( rect.pos_x + (peakHistory[i].timer - startTimer)/1000*3, rect.pos_y+1 );
      this.context.strokeStyle = '#00ff00';
      this.context.stroke();
      this.context.closePath();
    }

    // on dessine le curseur "play" vitesse: 2px / s
    this.context.beginPath();
    this.context.moveTo( rect.pos_x + (new Date() - startTimer)/1000*3, rect.pos_y + rect.size_y );
    this.context.lineTo( rect.pos_x + (new Date() - startTimer)/1000*3, rect.pos_y+1 );
    this.context.strokeStyle = 'red';
    this.context.stroke();
    this.context.closePath();

    // on a un beat 
    let beatPower = peak.value;
    this.context.beginPath();
    this.context.arc( rect.pos_x + rect.size_x - 20, rect.pos_y + rect.size_y / 2, 10, 0 , 2*Math.PI );
    this.context.fillStyle = `rgba(0,255,0,${beatPower})`;
    this.context.fill();
    this.context.closePath();
  }


  /**
   * Draws the history of the energy of each band
   * @param {Array} energiesHistory array history of the computed energies of each band over time
   */
  drawMultibandHistogram( energiesHistory )
  {
    let pannel = PANNEL_MULTIBAND_ENERGIES;

    // interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( pannel.pos_x+0.5, pannel.pos_y+0.5, pannel.size_x, pannel.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'white';
    this.context.fillText( `Multi-band energies comparaisons: ${AnalyserConfig.options.multibandPeakDetection.options.bands} bands / ${AnalyserConfig.options.multibandPeakDetection.options.energyPersistence}ms energy persistence / max 28 on screen`, pannel.pos_x+5, pannel.pos_y + 13 );

    let band_histogram_width = 64,
        band_histogram_height = 48,
        margin= 5,
        bands_y = 18,
        bands_x = margin;

    // parcours des bandes
    for( let band = 0; (band < AnalyserConfig.options.multibandPeakDetection.options.bands && band < 28); band++ )
    {
      // passage à la ligne
      if( bands_x + margin + band_histogram_width > this.canvas.width )
      {
        bands_x = margin;
        bands_y+= margin+band_histogram_height;
      }

      // on dessine le cadre de la bande 
      this.context.strokeStyle = 'white';
      this.context.strokeRect( pannel.pos_x + bands_x + 0.5, pannel.pos_y + bands_y + 0.5, band_histogram_width, band_histogram_height );
    
      // on va seulement parcourir une valeur sur 2 de chaque histogramme
      this.context.beginPath();
      for( let i = 0; i < energiesHistory.length; i++ )
      {
        this.context.lineTo( pannel.pos_x + bands_x + 0.5 + band_histogram_width - i / 2, pannel.pos_y + bands_y + band_histogram_height - 0.5 - energiesHistory[energiesHistory.length-i-1][band] * band_histogram_height / 256 )
      }
      this.context.strokeStyle = 'red';
      this.context.stroke();
      this.context.closePath();

      if( !(bands_x + margin + band_histogram_width > this.canvas.width) )
      {
        bands_x+= margin+band_histogram_width;
      }
    }
  }


  /**
   * Draws a visual guidance for all the bands peak
   * @param {Array} peaks array of each band peak
   * @param {Array} peaksHistory array of each band peaks hisory
   * @param {*} startTimer absolute timer of the start of analysis
   */
  drawMultibandPeakDetection( peaks, peaksHistory, startTimer )
  {
    let rect = PANNEL_ALGO_2;

    // first we draw the interface
    this.context.strokeStyle = 'white';
    this.context.strokeRect( rect.pos_x+0.5, rect.pos_y+0.5, rect.size_x, rect.size_y );
    this.context.font = '12px Lucida Console';
    this.context.fillStyle = 'white';
    this.context.fillText( `ALGO2 / bands: ${AnalyserConfig.options.multibandPeakDetection.options.bands} threshold: ${AnalyserConfig.options.multibandPeakDetection.options.threshold} / ignoreTime: ${AnalyserConfig.options.multibandPeakDetection.options.ignoreTime}`, rect.pos_x+5, rect.pos_y - 2 );

    let band_height = 20,
        margin = 5;
    let currentTimer = new Date();
    
    for( let b = 0; b < AnalyserConfig.options.multibandPeakDetection.options.bands; b++ )
    {
      for( let i = 0; i < peaksHistory[b].length; i++ )
      {
        this.context.beginPath();
        this.context.moveTo( 1+rect.pos_x + margin + (peaksHistory[b][i].timer-startTimer)/1000*3, rect.pos_y + b*band_height + margin*(b+1) );
        this.context.lineTo( 1+rect.pos_x + margin + (peaksHistory[b][i].timer-startTimer)/1000*3, rect.pos_y + b*band_height + margin*(b+1) + band_height );
        this.context.strokeStyle = `hsl(${b/AnalyserConfig.options.multibandPeakDetection.options.bands*180}, 100%, 50%)`;
        this.context.stroke();
        this.context.closePath();
      }

      // détection de beat
      
      let beatPower = peaks[b].value;
      this.context.beginPath();
      this.context.arc( rect.pos_x + rect.size_x - 20, rect.pos_y + b*band_height + margin*(b+1) + band_height/2, 7, 0 , 2*Math.PI );
      this.context.fillStyle = `hsl(${b/AnalyserConfig.options.multibandPeakDetection.options.bands*180}, 100%, ${beatPower*50}%)`;
      this.context.fill();
      this.context.closePath();

      // on dessine le curseur "play" vitesse: 2px / s
      this.context.beginPath();
      this.context.moveTo( 1+margin + rect.pos_x + (currentTimer - startTimer)/1000*3, rect.pos_y + (1+b)*margin + b*band_height );
      this.context.lineTo( 1+margin + rect.pos_x + (currentTimer - startTimer)/1000*3, rect.pos_y + (1+b)*margin + (b+1)*band_height );
      this.context.strokeStyle = 'white';
      this.context.stroke();
      this.context.closePath();

      this.context.strokeStyle = 'white';
      this.context.strokeRect( rect.pos_x + margin + 0.5, rect.pos_y +band_height*b + (b+1)*margin + 0.5, rect.size_x-margin*2, band_height );
    }
  }
  
};