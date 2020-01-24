﻿(function () {
    'use strict';

    angular.module("umbraco")
        .controller("FindAndReplaceCtrl", FindAndReplaceCtrl);

    FindAndReplaceCtrl.$inject = ['$scope', 'FindAndReplaceService'];

    function FindAndReplaceCtrl($scope, FindAndReplaceService) {
        var vm = this;
        var asyncLimit = 1;

        //properties
        vm.phrase = '';
        vm.replaceWith = '';
        vm.results = [];
        vm.contentRepository = [];
        vm.searchState = false;
        vm.showResultsSummary = false;
        vm.initialResultsCount = 1;
        vm.replaceAllActive = false;
        vm.completePercents = 0;

        //functions
        vm.replaceAll = replaceAll;
        vm.searchPhrase = searchPhrase;
        vm.sendReplace = sendReplace;

        function replaceAll() {
            vm.replaceAllActive = true;
            var limit = vm.results.length > asyncLimit ? asyncLimit : vm.results.length;
            for (var i = 0; i < limit; i++) {
                vm.sendReplace(vm.results[i]);
            }
        };

        function searchPhrase() {
            vm.searchState = true;

            var currentNodeId = $scope.currentNode.id;

            FindAndReplaceService.SearchForPhrase(vm.phrase, currentNodeId).then(function (data) {
                vm.showResultsSummary = true;
                assignSearchResults(data);
                vm.searchState = false;
                vm.initialResultsCount = vm.results.length;
            });
        };

        function sendReplace(result) {
            result.isActive = true;
            var outputValue = modifyContent(result);
            vm.completePercents = getProgress();

            FindAndReplaceService.SetValue(result.versionId, result.propertyAlias, result.valueField, outputValue)
                .then(function (changeResult) {
                    if (changeResult.Succeeded === false) return;

                    var index = getIndexOfActiveByContentId(parseInt(changeResult.PreviousVersionId, 10));
                    if (index !== false) {
                        vm.results.splice(index, 1); //remove item at given index
                        replaceCurrentVersion(changeResult.PreviousVersionId, changeResult.CurrentVersionId);
                    }

                    if (vm.replaceAllActive) {
                        var inactiveIndex = getIndexOfFirstInactive();
                        if (inactiveIndex !== false) {
                            vm.sendReplace(vm.results[inactiveIndex], inactiveIndex);
                        }
                        vm.completePercents = getProgress();
                    } else {
                        vm.initialResultsCount--;
                    }

                    if (vm.results.length === 0) {
                        vm.showResultsSummary = false;
                        vm.replaceAllActive = false;
                    }
                });
        };

        function assignSearchResults(data) {
            vm.results.length = 0;
            for (var i = 0; i < data.length; i++) {
                var inputValue = data[i].Value;
                var regexp = new RegExp(vm.phrase, 'g');
                var match;

                vm.contentRepository[data[i].VersionId + "_" + data[i].PropertyAlias] = { value: inputValue };

                while ((match = regexp.exec(inputValue)) !== null) {
                    var outputValue = replaceAt(inputValue, match.index, vm.phrase, vm.replaceWith);

                    vm.results.push({
                        previewBefore: getRenderPreview(inputValue, match.index, vm.phrase),
                        previewAfter: getRenderPreview(outputValue, match.index, vm.replaceWith),
                        matchIndex: match.index,
                        versionId: data[i].VersionId,
                        propertyAlias: data[i].PropertyAlias,
                        propertyName: data[i].PropertyName,
                        name: data[i].NodeName,
                        valueField: data[i].ValueField,
                        isActive: false
                    });
                }
            }
        };

        function getIndexOfActiveByContentId(versionId) {
            for (var i = 0; i < vm.results.length; i++) {
                if (vm.results[i].versionId === versionId && vm.results[i].isActive === true) {
                    return i;
                }
            }
            return false;
        };

        function replaceCurrentVersion(previousVersionId, currentVersionId) {
            for (var i = 0; i < vm.results.length; i++) {
                if (vm.results[i].versionId === previousVersionId) {

                    Object.keys(vm.contentRepository).forEach(key => {

                        if (key.includes(`${previousVersionId}_`)) {
                            var newKey = key.replace(`${previousVersionId}_`, `${currentVersionId}_`);
                            var value = vm.contentRepository[key];

                            delete vm.contentRepository[key];

                            Object.assign(vm.contentRepository, { [newKey]: value });
                        }
                    });

                    vm.results[i].versionId = currentVersionId;
                }
            }
        }

        function getIndexOfFirstInactive() {
            for (var i = 0; i < vm.results.length; i++) {
                if (vm.results[i].isActive === false) {
                    return i;
                }
            }
            return false;
        };

        function getRenderPreview(input, matchIndex, phrase) {
            var preview = input.substr(matchIndex - 20, phrase.length + 40);
            var htmlTagsRegex = /[^a-zA-z\d\s\.,-]/g;
            preview = preview.replace(htmlTagsRegex, "");
            return preview.replace(phrase, '<b><mark>' + phrase + '</mark></b>');
        };

        function modifyContent(result) {
            var outputValue = replaceAt(vm.contentRepository[result.versionId + "_" + result.propertyAlias].value, result.matchIndex, vm.phrase, vm.replaceWith);
            var otherFromTheSameContent = $.grep(vm.results, function (e) {
                return e.versionId === result.versionId && e.propertyAlias === result.propertyAlias && e.matchIndex > result.matchIndex;
            });

            vm.contentRepository[result.versionId + "_" + result.propertyAlias].value = outputValue;

            otherFromTheSameContent.forEach(function (item) {
                item.matchIndex += vm.replaceWith.length - vm.phrase.length;
            });

            return outputValue;
        };

        function replaceAt(input, matchIndex, phrase, replaceWith) {
            return input.substr(0, matchIndex) + replaceWith + input.substr(matchIndex + phrase.length);
        };

        function getProgress() {
            return (100 - parseInt((vm.results.length / vm.initialResultsCount) * 100, 10)) + '%';
        }
    };
})();