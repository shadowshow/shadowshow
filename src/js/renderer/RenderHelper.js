import TextRenderer from './TextRenderer.js'
import DeepProxy from '../core/DeepProxy.js'
import Core from '../core/Core.js'

class RenderHelper {
    static render(node, data, context, options) {
        if (node.nodeName === '#comment'
            || (node.nodeName === '#text' && node.data === '')) {
            return;
        }
        context = context || {};
        options = options || {};

        node[Core.shadowSymbol] = node[Core.shadowSymbol] || {};
        let updater = node[Core.shadowSymbol].updater = node[Core.shadowSymbol].updater || (function() {
            let func = function(data) {
                let nodeShadow = node[Core.shadowSymbol];
                let proxy = DeepProxy.create(data, {
                    get: (target, propKey, receiver) => {
                        let v = target[propKey];
                        if (typeof propKey !== 'symbol' && typeof v !== 'object') {
                            let shadow = Core.resolveShadow(target);
                            let watchers = Core.getWatchers(shadow, propKey);
                            let newUpdater = false;
                            if (options.debug) {
                                if (!watchers.has(updater)) {
                                    newUpdater = true;
                                    console.log('adding watcher for ' + (shadow.name ? shadow.name + '.' : '') + propKey.toString() + ':');
                                    console.log(node);
                                }
                            }
                            watchers.add(updater);
                            if (options.debug) {
                                if (newUpdater) {
                                    console.log(watchers);
                                }
                            }
                        }
                        return v;
                    }
                }, obj => {}, k => k !== Core.shadowSymbol);

                let renderer = nodeShadow.renderer = nodeShadow.renderer || (function() {
                    if (node.nodeName === '#text') {
                        return new TextRenderer({
                            template: node.data,
                            debug: options.debug
                        }).complete(
                            result => node.data = result
                        );
                    } else {
                        return new NodeRenderer({
                            template: node,
                            debug: options.debug
                        });
                    }
                })();

                return renderer.render(proxy, context);
            }
            if (options.debug) {
                func.node = node;
                func.desc = node.nodeName + (node.id ? '#' + node.id : '');
            }
            return func;
        })();

        if (updater(data) && node.childNodes) {
            node.childNodes.forEach(child => {
                this.render(child, data, context, options);
            });
        }
    }
}

class NodeRenderer {
    constructor(options) {
        this.options = options || {};
    }
    render(data, context) {
        let fn = this.fn = this.fn || (() => {
            let el = this.options.template;

            let ifExpression = el.getAttribute('@if');
            if (ifExpression) {
                el.removeAttribute('@if');
                let renderer = el[Core.shadowSymbol].ifRenderer = el[Core.shadowSymbol].ifRenderer || new TextRenderer({
                    template: ifExpression
                });
                let author = document.createTextNode('');
                author[Core.shadowSymbol] = el[Core.shadowSymbol];
                el.parentNode.insertBefore(author, el);
                if (renderer.render(data, context).trim() === 'false') {
                    el.remove();
                }
                let f = (data, context) => {
                    if (renderer.render(data, context).trim() === 'false') {
                        el.remove();
                        return false;
                    } else {
                        author.parentNode.insertBefore(el, author);
                        return true;
                    }
                };
                return f;
            }
            let loopExpresstion = el.getAttribute('@each') || el.getAttribute('@for');
            if (!loopExpresstion) {
                if (el.getAttribute('@href')) {
                    new TextRenderer({
                        template: el.getAttribute('@href')
                    }).complete(result => {
                        el.href = result;
                        el.removeAttribute('@href');
                    }).render(data, context);
                }
                return () => true;
            }
            let author = document.createTextNode('');
            author[Core.shadowSymbol] = el[Core.shadowSymbol];
            el.parentNode.insertBefore(author, el);
            el.removeAttribute('@each');
            el.removeAttribute('@for');
            el.remove();

            let foo = loopExpresstion.split(/\sin\s/);
            let itemName = foo[0];
            let listName = foo[1];

            let functionBody =
                `return data =>{
    for(let i in data.${listName} ){
        let ${itemName} = data.${listName}[i];
        let newEl = el.cloneNode(true);
        author.parentNode.insertBefore(newEl, author);
        RenderHelper.render(newEl, data, Object.assign({}, context, {${itemName}:${itemName}}), options);
    }
    return false;
}`;
            for (let name of el.getAttributeNames()) {
                if(/^@/.test(name)){
                    let value = el.getAttribute(name);
                    el.removeAttribute(name);
                    el.setAttribute(name.substring(1), value);
                }
            }
            return new Function('context', 'el', 'data', 'RenderHelper', 'author', 'options',
                functionBody)(context, el, data, RenderHelper, author, { debug: this.options.debug });
        })();
        return fn(data, context);
    }
}
export default RenderHelper