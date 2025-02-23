import { parseFilename } from '@aiostreams/parser';
import {
  ParsedStream,
  Stream,
  Config,
  AddonDetail,
  ParsedNameData,
  StreamRequest,
  ParseResult,
} from '@aiostreams/types';
import { BaseWrapper } from './base';
import { addonDetails, Settings } from '@aiostreams/utils';
import { fetch as uFetch } from 'undici';
import { emojiToLanguage } from '@aiostreams/formatters';

export class RealDebridPlus extends BaseWrapper {
  constructor(
    addonId: string,
    userConfig: Config,
    apiKey: string,
    addonName: string = 'RealDebridPlus',
    indexerTimeout?: number
  ) {
    super(
      addonName,
      Settings.REALDEBRID_API_URL + `torrents?auth_token=${apiKey}`,
      addonId,
      userConfig,
      indexerTimeout || Settings.DEFAULT_DMM_CAST_TIMEOUT
    );
  }

  protected async getStreamName(streamRequest: StreamRequest): Promise<string> {
    const [imdbId] = streamRequest.id.split(':');
    const type = streamRequest.type;
    const catalogUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;

    const catalogResponse = await this.makeRequest(catalogUrl);
    if (!catalogResponse.ok) {
      throw new Error(
        `Failed to fetch catalog details: ${catalogResponse.statusText}`
      );
    }

    const catalogData = await catalogResponse.json();
    const name = catalogData.meta?.name;
    return name;
  }

  protected parseStream(stream: Stream): ParseResult {
    // the streams for RealDebridPlus can be one of the following
    // 1:Cast - Cast a file inside a torrent
    // 2:Stream - Stream the latest link you casted
    // DMM Other - Filename can be split across multiple lines with 📦 {size} at last line
    // DMM Yours - Filename can be split across multiple lines with 📦 {size} at last line
    let message = '';
    let filename = stream.title
      ? stream.title
          .split('\n')
          .map((line) => line.replace(/-$/, ''))
          .filter((line) => !line.includes('📦'))
          .join('')
      : stream.behaviorHints?.filename?.trim();
    if (!stream.title?.includes('📦')) {
      filename = undefined;
      message = stream.title || '';
    }

    const parsedFilename: ParsedNameData = parseFilename(filename || '');
    const sizeInBytes = stream.title?.split('\n').pop()?.includes('📦')
      ? this.extractSizeInBytes(stream.title.split('\n').pop()!, 1024)
      : 0;

    const parseResult: ParseResult = this.createParsedResult(
      parsedFilename,
      stream,
      filename,
      sizeInBytes
    );
    if (parseResult.type === 'stream') {
      parseResult.result.message = message;
    }
    return parseResult;
  }
}

export async function getRealDebridPlusStreams(
  config: Config,
  streamRequest: StreamRequest,
  addonId: string
): Promise<{
  addonStreams: ParsedStream[];
  addonErrors: string[];
}> {
  const realdebridService = config.services.find(
    (service) => service.id === 'realdebrid'
  );
  if (!realdebridService) {
    throw new Error('RealDebrid service not found');
  }
  const realdebridApiKey = realdebridService.credentials.apiKey;
  const realDebridPlus = new RealDebridPlus(addonId, config, realdebridApiKey);
  return await realDebridPlus.getParsedStreams(streamRequest);
}
