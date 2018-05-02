import { createWidget } from 'discourse/widgets/widget';
import DiscourseURL from 'discourse/lib/url';
import Category from 'discourse/models/category';
import { getOwner } from 'discourse-common/lib/get-owner';
import { categoryTagPath } from '../lib/utilities';
import { h } from 'virtual-dom';

const formatFilter = function(filter) {
  return filter.charAt(0).toUpperCase() + filter.slice(1);
};

createWidget('category-list-item', {
  tagName: 'li',

  buildClasses(attrs) {
    let classes = '';
    if (attrs.addBorder) classes += 'add-border';
    return classes;
  },

  html(attrs) {
    const category = this.attrs.category;
    const label = category ? category.get('name') : this.attrs.label;
    return h('span', label);
  },

  click() {
    const category = this.attrs.category;
    const url = category ? category.get('url') : this.attrs.url;

    this.sendWidgetAction('hideLists');

    DiscourseURL.routeTo(url);
  }
});

createWidget('filter-list-item', {
  tagName: 'li',

  html(attrs) {
    return h('span', formatFilter(attrs.filter));
  },

  click() {
    this.sendWidgetAction('hideLists');
    const path = this.attrs.path;
    const isCategory = path.indexOf('/c/') > -1;
    const baseUrl = isCategory ? path.split('/l/')[0] + '/l/' : '/';
    const newUrl = baseUrl + this.attrs.filter;
    DiscourseURL.routeTo(newUrl);
  }
});

createWidget('tag-list-item', {
  tagName: 'li',

  html(attrs) {
    return h('span', attrs.tagId);
  },

  click() {
    this.sendWidgetAction('hideLists');
    const category = this.attrs.category;
    const filter = this.attrs.filter;
    const tagId = this.attrs.tagId;
    const tagPath = categoryTagPath(tagId, { category });

    let url = filter ? tagPath + '/l/' + filter : tagPath;

    DiscourseURL.routeTo(url);
  }
});

export default createWidget('civically-path', {
  tagName: 'div.civically-path',
  buildKey: () => 'civically-path',

  defaultState() {
    const categoriesList = this.site.get('categoriesList');
    const currentUser = this.currentUser;
    const placeCategoryId = currentUser.place_category_id;
    const parentCategories = categoriesList.filter(c => {
      const hasParent = c.get('parentCategory');
      const isUncategorizedCategory = c.get('isUncategorizedCategory');
      if (hasParent || isUncategorizedCategory) return false;

      const isPlace = c.get('is_place');
      if (isPlace) {
        if (!placeCategoryId) return false;

        const parentCategoryId = c.get('id');
        const place = Category.findById(placeCategoryId);
        return place.parent_category_id === parentCategoryId;
      }

      return true;
    });

    const placeIndex = parentCategories.findIndex(c => c.get('is_place'));
    parentCategories.splice(0, 0, parentCategories.splice(placeIndex, 1)[0]);

    return {
      categoriesList,
      parentCategories,
      parentList: false,
      childList: false,
      filterList: false,
      tagList: false
    };
  },

  buildTitle(type, name) {
    return this.attach('link', {
      action: 'showList',
      actionParam: type,
      rawTitle: name,
      rawLabel: name,
      className: `list-title ${name}`
    });
  },

  html(attrs, state) {
    const path = window.location.pathname;

    let category = attrs.category;
    let contents = [];
    let tag = null;
    let tags = null;
    let tagsRoute = path.indexOf('/tags/') > -1;
    let tagLists = [];

    // to fix: make pr to core to add category and tag to discovery-list-container-top outlet in tags
    if (tagsRoute) {
      const tagsController = getOwner(this).lookup('controller:tags-show');
      category = tagsController.get('category');
      tag = tagsController.get('tag');
    }

    let categoryLists = [];

    if (category) {
      const parentCategory = category.get('parentCategory');

      if (parentCategory) {
        categoryLists.push(this.buildTitle('parent', parentCategory.name));
        categoryLists.push(h('span', '>'));
        categoryLists.push(this.buildTitle('child', category.name));
      } else {
        categoryLists.push(this.buildTitle('parent', category.name));

        if (category.is_place || category.has_children) {
          categoryLists.push(h('span', '>'));
          const label = I18n.t('categories.all_subcategories', { categoryName: category.name });
          categoryLists.push(this.buildTitle('child', label));
        }
      }
    } else {
      categoryLists.push(this.buildTitle('parent', I18n.t('categories.all')));
    }

    if (state.parentList) {
      const parentCategories = state.parentCategories;
      const userPlaceIsSet = Boolean(this.currentUser.place_category_id);
      categoryLists.push(this.buildCategoryList(parentCategories, userPlaceIsSet));
    }

    if (category && state.childList) {
      const parentCategory = category.get('parentCategory') || category;
      const categoriesList = state.categoriesList;
      const childCategories = categoriesList.filter(c => {
        return c.get('parentCategory.id') === parentCategory.id;
      });

      const placeCategoryId = this.currentUser.place_category_id;
      if (placeCategoryId) {
        const placeIndex = childCategories.findIndex(c => c.id === placeCategoryId);
        childCategories.splice(0, 0, childCategories.splice(placeIndex, 1)[0]);
      }

      const parentIsPlace = parentCategory.get('place');

      categoryLists.push(this.buildCategoryList(childCategories, parentIsPlace, parentCategory));
    }

    contents.push(h('span.category-lists', categoryLists));

    let filterLists = [];

    const hasFilter = path.indexOf('/l/') > -1;
    const filter = hasFilter ? path.split('/l/')[1] : 'latest';
    filterLists.push(h('span', '>'));
    filterLists.push(this.buildTitle('filter', formatFilter(filter)));

    if (state.filterList) {
      let filters = Array.from(new Set(this.site.get('filters')));
      filters = filters.filter((f) => f !== 'map');
      filterLists.push(this.buildFilterList(filters, path));
    }

    contents.push(h('span.filter-lists', filterLists));

    let label = tag ? tag.get('id') : I18n.t('tagging.selector_all_tags');
    tagLists.push(this.buildTitle('tag', label));

    if (state.tagList) {
      const tags = this.site.top_tags;
      tagLists.push(this.buildTagList(tags, category, filter));
    }

    contents.push(h('span.tag-lists', tagLists));

    return h('div.widget-multi-title', contents);
  },

  showList(type) {
    this.state[`${type}List`] = !this.state[`${type}List`];
    ['parent', 'child', 'filter', 'tag'].forEach((t) => {
      if (t !== type) this.state[`${t}List`] = false;
    });
    this.scheduleRerender();
  },

  hideLists() {
    this.state.parentList = false;
    this.state.childList = false;
    this.state.filterList = false;
    this.state.tagList = false;
    this.scheduleRerender();
  },

  buildCategoryList(categories, showBorder, parentCategory = null) {
    let list = categories.map((category, index) => {
      const addBorder = index === 0 && showBorder;
      return this.attach('category-list-item', { category, addBorder });
    });

    if (parentCategory) {
      list.unshift(this.attach('category-list-item', {
        label: I18n.t('categories.all_subcategories', { categoryName: parentCategory.name }),
        url: parentCategory.get('url')
      }));
    }

    return h('ul.nav-dropdown', list);
  },

  buildFilterList(filters, path) {
    return h('ul.nav-dropdown', filters.map(filter => {
      return this.attach('filter-list-item', { filter, path });
    }));
  },

  buildTagList(tags, category, filter) {

    const catUrl = category.get('url');
    let allUrl = filter ? catUrl + '/l/' + filter : catUrl

    let list = [this.attach('category-list-item', {
      label: I18n.t('tagging.selector_all_tags'),
      url: allUrl
    })];

    list.push(...tags.map(tagId => {
      return this.attach('tag-list-item', { tagId, category, filter });
    }));

    return h('ul.nav-dropdown', list);
  },

  click() {
    this.hideLists();
  },

  clickOutside() {
    this.hideLists();
  }
});
