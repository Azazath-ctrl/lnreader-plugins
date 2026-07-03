import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters } from '@libs/filterInputs';
import { defaultCover } from '@/types/constants';

class NovelArchive implements Plugin.PluginBase {
  id = 'novelarchive';
  name = 'Novel Archive';
  version = '1.0.0';
  icon = 'src/en/novelarchive/icon.png';
  site = 'https://novelarchive.cc/';
  webStorageUtilized = false;

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      }
    });
    
    if (!r.ok && search !== true) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    
    const $ = load(await r.text());
    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Try again later inside Webview.');
    }
    return $;
  }

  parseNovels(loadedCheerio: CheerioAPI, selector = '.novel-item'): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];
    const elements = loadedCheerio(selector).toArray();

    for (const el of elements) {
      const $el = loadedCheerio(el);
      
      const novelName = $el.find('h3 a').text().trim() || $el.find('.novel-title').text().trim();
      const novelPath = $el.find('h3 a').attr('href') || $el.find('a').attr('href');
      
      if (!novelPath) continue;
      
      // Cleans the URL path down to a local relative path
      const path = new URL(novelPath, this.site).pathname.substring(1);
      
      const imgElement = $el.find('.novel-cover img').first();
      const rawSrc = imgElement.attr('data-src') || imgElement.attr('src');
      const novelCover = rawSrc ? new URL(rawSrc, this.site).href : defaultCover;

      novels.push({
        name: novelName,
        cover: novelCover,
        path,
      });
    }
    return novels;
  }

  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    // Falls back seamlessly to the home index if page is 1, otherwise hits pagination endpoint
    const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}`;
    const loadedCheerio = await this.getCheerio(url, false);
    
    return this.parseNovels(loadedCheerio, '.novel-item');
  }

  async latestNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    // Reusing the page directory parser for latest updates if layout matches popular
    const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}`;
    const loadedCheerio = await this.getCheerio(url, false);
    
    return this.parseNovels(loadedCheerio, '.novel-item');
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath, false);
    
    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };

    novel.name = $('h1.entry-title').text().trim() || 'No Title Found';
    
    const coverUrl = $('.novel-cover img').attr('src') || $('.cover img').attr('src');
    novel.cover = coverUrl ? new URL(coverUrl, this.site).href : defaultCover;
    
    // Summary handling with standard paragraph and line-break normalization
    const summary = $('.novel-description');
    summary.find('br').replaceWith('\n');
    novel.summary = summary.text().trim() || 'Summary Not Found';

    // Extend placeholders for author/genres if structural selectors are discovered later
    novel.author = $('.author, .novel-author').text().trim() || 'Unknown';
    novel.genres = ''; 
    novel.status = NovelStatus.Unknown;

    // Parses chapter lists out of the native list structure
    const chapters: Plugin.ChapterItem[] = [];
    $('.chapter-list li').each((_, ele) => {
      const $ele = $(ele);
      const chapterName = $ele.find('a').text().trim() || 'No Title Found';
      const chapterPath = $ele.find('a').attr('href');
      
      if (chapterPath) {
        chapters.push({
          name: chapterName,
          path: new URL(chapterPath, this.site).pathname.substring(1),
        });
      }
    });

    novel.chapters = chapters;
    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const loadedCheerio = await this.getCheerio(url, false);
    
    const chapterText = loadedCheerio('.chapter-content');
    return chapterText.html()?.replace(/&nbsp;/g, ' ') || '';
  }

  async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams();
    params.append('s', searchTerm);
    if (page > 1) {
      params.append('page', page.toString());
    }

    const url = `${this.site}?${params.toString()}`;
    const loadedCheerio = await this.getCheerio(url, true);
    
    return this.parseNovels(loadedCheerio, '.novel-item');
  }

  filters = {} satisfies Filters;
}

export default new NovelArchive();